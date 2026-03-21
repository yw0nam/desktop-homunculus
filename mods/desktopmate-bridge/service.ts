import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { signals, Vrm, type TimelineKeyframe, type TransformArgs, preferences, repeat, sleep } from "@hmcs/sdk";
import { rpc } from "@hmcs/sdk/rpc";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  fastapi: {
    ws_url: string;
    rest_url: string;
    token: string;
    user_id: string;
    agent_id: string;
  };
  homunculus: {
    api_url: string;
  };
}

function loadConfig(): Config {
  const path = resolve(__dirname, "config.yaml");
  const raw = yaml.load(readFileSync(path, "utf-8")) as Config;
  return raw;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 3000];

interface RetryState {
  attempts: number;
}

function shouldRetry(code: number): boolean {
  return code === 4000 || code === 1011;
}

function nextRetryDelay(state: RetryState): number | null {
  if (state.attempts >= MAX_RETRIES) return null;
  return RETRY_DELAYS_MS[state.attempts] ?? null;
}

async function handleMessage(
  event: MessageEvent,
  config: Config,
  vrm: Vrm,
): Promise<void> {
  const msg = JSON.parse(event.data as string);
  switch (msg.type) {
    case "authorize_success":
      _connectionId = (msg.connection_id as string | undefined) ?? null;
      await signals.send("dm-connection-status", { status: "connected" });
      break;
    case "authorize_error":
      _authFailed = true;
      await signals.send("dm-connection-status", { status: "disconnected" });
      break;
    case "stream_start":
      await signals.send("dm-typing-start", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
      });
      break;
    case "tts_chunk":
      await handleTtsChunk(msg, vrm);
      break;
    case "stream_end":
      await signals.send("dm-message-complete", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
        content: msg.content,
      });
      break;
    case "ping":
      sendWsMessage({ type: "pong" });
      break;
  }
}

async function handleTtsChunk(
  msg: {
    sequence: number;
    text: string;
    emotion: string;
    audio_base64: string | null;
    keyframes: TimelineKeyframe[];
  },
  vrm: Vrm,
): Promise<void> {
  if (msg.audio_base64) {
    const audioBytes = Buffer.from(msg.audio_base64, "base64");
    await vrm.speakWithTimeline(audioBytes, msg.keyframes);
  }
  await signals.send("dm-tts-chunk", {
    sequence: msg.sequence,
    text: msg.text,
    emotion: msg.emotion,
  });
}

let _ws: WebSocket | null = null;
let _connectionId: string | null = null;
let _authFailed = false;

function sendWsMessage(payload: unknown): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(payload));
  }
}

function startRpcServer(config: Config) {
  const sendMessage = rpc.method({
    description: "Send chat message via FastAPI WebSocket",
    input: z.object({ content: z.string(), session_id: z.string().optional() }),
    handler: async ({ content, session_id }) => {
      sendWsMessage({
        type: "chat_message",
        content,
        session_id,
        user_id: config.fastapi.user_id,
        agent_id: config.fastapi.agent_id,
      });
      return { ok: true };
    },
  });
  const interruptStream = rpc.method({
    description: "Interrupt current AI stream",
    handler: async () => {
      sendWsMessage({ type: "interrupt_stream" });
      return { ok: true };
    },
  });
  return rpc.serve({ methods: { sendMessage, interruptStream } });
}

async function connectWithRetry(
  config: Config,
  vrm: Vrm,
  retryState: RetryState,
): Promise<void> {
  const ws = new WebSocket(config.fastapi.ws_url);
  _ws = ws;

  ws.addEventListener("open", () => {
    ws.send(
      JSON.stringify({
        type: "authorize",
        token: config.fastapi.token,
        user_id: config.fastapi.user_id,
        agent_id: config.fastapi.agent_id,
      }),
    );
  });

  ws.addEventListener("message", (event) => {
    handleMessage(event, config, vrm).catch(console.error);
  });

  ws.addEventListener("close", async (event) => {
    await handleClose(event, config, vrm, retryState);
  });
}

async function handleClose(
  event: CloseEvent,
  config: Config,
  vrm: Vrm,
  retryState: RetryState,
): Promise<void> {
  const code = event.code;

  // 4001 or authorize_error already sent disconnected signal
  if (code === 4001 || _authFailed) return;
  // spec: 4002 wait stream_end, 4003 normal close, 4004 no-op
  if (code === 4002 || code === 4003 || code === 4004) return;
  if (!shouldRetry(code)) {
    await signals.send("dm-connection-status", { status: "disconnected" });
    return;
  }

  const delay = nextRetryDelay(retryState);
  if (delay === null) {
    await signals.send("dm-connection-status", { status: "restart-required" });
    return;
  }

  await new Promise((r) => setTimeout(r, delay));
  await connectWithRetry(config, vrm, { attempts: retryState.attempts + 1 });
}

// TODO: make VRM asset configurable via UI settings
const CHARACTER_ASSET_ID = "desktopmate-bridge:elmer";

async function handleVrmStateChange(
  e: { state: string },
  vrm: Vrm,
  animOpts: { repeat: ReturnType<typeof repeat.forever>; transitionSecs: number },
): Promise<void> {
  if (e.state === "idle") {
    await vrm.playVrma({ asset: "vrma:idle-maid", ...animOpts });
    await sleep(500);
    await vrm.lookAtCursor();
  } else if (e.state === "drag") {
    await vrm.unlook();
    await vrm.playVrma({ asset: "vrma:grabbed", ...animOpts, resetSpringBones: true });
  } else if (e.state === "sitting") {
    await vrm.playVrma({ asset: "vrma:idle-sitting", ...animOpts });
    await sleep(500);
    await vrm.lookAtCursor();
  }
}

async function spawnCharacter(): Promise<Vrm> {
  const transform = await preferences.load<TransformArgs>(`transform::${CHARACTER_ASSET_ID}`);
  const vrm = await Vrm.spawn(CHARACTER_ASSET_ID, { transform });
  const animOpts = { repeat: repeat.forever(), transitionSecs: 0.5 } as const;

  await vrm.playVrma({ asset: "vrma:idle-maid", ...animOpts });

  vrm.events().on("state-change", (e) =>
    handleVrmStateChange(e, vrm, animOpts).catch(console.error),
  );

  return vrm;
}

async function connectAndServe(config: Config, vrm: Vrm): Promise<void> {
  await signals.send("dm-config", {
    user_id: config.fastapi.user_id,
    agent_id: config.fastapi.agent_id,
    fastapi_rest_url: config.fastapi.rest_url,
  });

  // TODO: store rpcServer and call rpcServer.stop() on graceful shutdown
  // Requires @hmcs/sdk to expose a stop() API on the returned server handle.
  await startRpcServer(config);
  await connectWithRetry(config, vrm, { attempts: 0 });
}

// --- entry point ---
const config = loadConfig();
const vrm = await spawnCharacter();              // VRM spawned first
connectAndServe(config, vrm).catch(console.error); // fire-and-forget: WS + RPC
