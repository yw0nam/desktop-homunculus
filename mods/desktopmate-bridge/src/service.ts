import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { signals, Vrm, type TimelineKeyframe, type TransformArgs, preferences, repeat, sleep } from "@hmcs/sdk";
import { rpc } from "@hmcs/sdk/rpc";
import { z } from "zod";
import { listWindows, captureScreen, captureWindow } from "./screen-capture.js";
import { TtsChunkQueue, type TtsChunk } from "./tts-chunk-queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../config.yaml");

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
  tts: {
    reference_id: string;
  };
}

function loadConfig(): Config {
  const raw = yaml.load(readFileSync(CONFIG_PATH, "utf-8")) as Config;
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
): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(event.data as string) as Record<string, unknown>;
  } catch {
    await signals.send("dm-connection-status", { status: "error" } as never);
    return;
  }
  switch (msg.type) {
    case "authorize_success":
      _connectionId = (msg.connection_id as string | undefined) ?? null;
      _connectionStatus = "connected";
      await signals.send("dm-connection-status", { status: "connected" });
      break;
    case "authorize_error":
      _authFailed = true;
      _connectionStatus = "disconnected";
      await signals.send("dm-connection-status", { status: "disconnected" });
      break;
    case "stream_start":
      _ttsQueue.reset();
      await signals.send("dm-typing-start", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
      });
      break;
    case "tts_chunk":
      _ttsQueue.enqueue(msg as TtsChunk);
      break;
    case "stream_end":
      _ttsQueue.flush();
      await signals.send("dm-message-complete", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
        content: msg.content,
      });
      break;
    case "stream_token":
      await signals.send("dm-stream-token", {
        turn_id: msg.turn_id,
        chunk: msg.chunk,
      });
      break;
    case "ping":
      sendWsMessage({ type: "pong" });
      break;
  }
}

function createTtsQueue(vrm: Vrm): TtsChunkQueue {
  return new TtsChunkQueue(async (chunk) => {
    if (chunk.audio_base64) {
      const audioBytes = Buffer.from(chunk.audio_base64, "base64");
      await vrm.speakWithTimeline(audioBytes, chunk.keyframes as TimelineKeyframe[], {
        waitForCompletion: true,
      });
    }
    await signals.send("dm-tts-chunk", {
      sequence: chunk.sequence,
      text: chunk.text,
      emotion: chunk.emotion,
    });
  });
}

let _ws: WebSocket | null = null;
let _connectionId: string | null = null;
let _authFailed = false;
let _connectionStatus: "connected" | "disconnected" | "restart-required" = "disconnected";
let _ttsQueue!: TtsChunkQueue;

function sendWsMessage(payload: unknown): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(payload));
  }
}

function startRpcServer(config: Config) {
  const sendMessage = rpc.method({
    description: "Send chat message via FastAPI WebSocket",
    input: z.object({
      content: z.string(),
      session_id: z.string().optional(),
      images: z.array(z.object({
        type: z.literal("image_url"),
        image_url: z.object({ url: z.string(), detail: z.string() }),
      })).optional(),
    }),
    handler: async ({ content, session_id, images }) => {
      sendWsMessage({
        type: "chat_message",
        content,
        session_id,
        user_id: config.fastapi.user_id,
        agent_id: config.fastapi.agent_id,
        reference_id: config.tts.reference_id || undefined,
        images,
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
  const updateConfig = rpc.method({
    description: "Update config fields and write back to config.yaml",
    input: z.object({
      user_id: z.string(),
      agent_id: z.string(),
      fastapi_rest_url: z.string(),
      fastapi_ws_url: z.string(),
      fastapi_token: z.string().optional().default(""),
      homunculus_api_url: z.string(),
      tts_reference_id: z.string(),
    }),
    // JS objects are reference-passed, so mutating `config` here updates the same
    // object held by `connectAndServe` — changes take effect for subsequent operations.
    handler: async (input) => {
      config.fastapi.user_id = input.user_id;
      config.fastapi.agent_id = input.agent_id;
      config.fastapi.rest_url = input.fastapi_rest_url;
      config.fastapi.ws_url = input.fastapi_ws_url;
      config.fastapi.token = input.fastapi_token;
      config.homunculus.api_url = input.homunculus_api_url;
      config.tts.reference_id = input.tts_reference_id;
      writeFileSync(CONFIG_PATH, yaml.dump(config), "utf-8");
      await broadcastConfig(config);
      return { ok: true };
    },
  });
  const getStatus = rpc.method({
    description: "Get current connection status and config",
    handler: async () => ({
      status: _connectionStatus,
      config: {
        user_id: config.fastapi.user_id,
        agent_id: config.fastapi.agent_id,
        fastapi_rest_url: config.fastapi.rest_url,
        fastapi_ws_url: config.fastapi.ws_url,
        homunculus_api_url: config.homunculus.api_url,
        tts_reference_id: config.tts.reference_id,
      },
    }),
  });
  const listWindowsMethod = rpc.method({
    description: "List all visible windows",
    handler: async () => listWindows(),
  });
  const captureScreenMethod = rpc.method({
    description: "Capture the primary screen as base64 PNG",
    handler: async () => captureScreen(),
  });
  const captureWindowMethod = rpc.method({
    description: "Capture a specific window as base64 PNG",
    input: z.object({ id: z.string() }),
    handler: async ({ id }) => captureWindow(id),
  });
  const reconnectMethod = rpc.method({
    description: "Re-establish WebSocket connection to FastAPI backend",
    handler: async () => {
      _authFailed = false;
      _connectionStatus = "disconnected";
      if (_ws) {
        _ws.onclose = null;
        _ws.close();
      }
      await signals.send("dm-connection-status", { status: "disconnected" });
      connectWithRetry(config, vrm, { attempts: 0 }).catch(console.error);
      return { ok: true };
    },
  });
  return rpc.serve({
    methods: {
      sendMessage,
      interruptStream,
      updateConfig,
      getStatus,
      listWindows: listWindowsMethod,
      captureScreen: captureScreenMethod,
      captureWindow: captureWindowMethod,
      reconnect: reconnectMethod,
    },
  });
}

async function connectWithRetry(
  config: Config,
  vrm: Vrm,
  retryState: RetryState,
): Promise<void> {
  if (_ws) _ws.onclose = null;
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
    handleMessage(event, config).catch(console.error);
  });

  ws.addEventListener("close", async (event) => {
    if (ws !== _ws) return; // stale socket: reconnect replaced this socket, ignore
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
    _connectionStatus = "disconnected";
    await signals.send("dm-connection-status", { status: "disconnected" });
    return;
  }

  const delay = nextRetryDelay(retryState);
  if (delay === null) {
    _connectionStatus = "restart-required";
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

async function broadcastConfig(config: Config): Promise<void> {
  await signals.send("dm-config", {
    user_id: config.fastapi.user_id,
    agent_id: config.fastapi.agent_id,
    fastapi_rest_url: config.fastapi.rest_url,
    fastapi_ws_url: config.fastapi.ws_url,
    homunculus_api_url: config.homunculus.api_url,
    tts_reference_id: config.tts.reference_id,
  });
}

async function connectAndServe(config: Config, vrm: Vrm): Promise<void> {
  await broadcastConfig(config);

  // TODO: store rpcServer and call rpcServer.stop() on graceful shutdown
  // Requires @hmcs/sdk to expose a stop() API on the returned server handle.
  await startRpcServer(config);
  await connectWithRetry(config, vrm, { attempts: 0 });
}

// --- entry point ---
const config = loadConfig();
const vrm = await spawnCharacter();              // VRM spawned first
_ttsQueue = createTtsQueue(vrm);
connectAndServe(config, vrm).catch(console.error); // fire-and-forget: WS + RPC
