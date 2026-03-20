import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { signals, Vrm, type TimelineKeyframe } from "@hmcs/sdk";
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
    entity_id: number;
    api_url: string;
  };
}

function loadConfig(): Config {
  const path = resolve(__dirname, "config.yaml");
  const raw = yaml.load(readFileSync(path, "utf-8")) as Config;
  raw.homunculus.entity_id = Number(raw.homunculus.entity_id);
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
  const msg = JSON.parse(event.data as string);
  switch (msg.type) {
    case "authorize_success":
      await signals.send("dm-connection-status", { status: "connected" });
      break;
    case "authorize_error":
      await signals.send("dm-connection-status", { status: "disconnected" });
      break;
    case "stream_start":
      await signals.send("dm-typing-start", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
      });
      break;
    case "tts_chunk":
      await handleTtsChunk(msg, config);
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
  config: Config,
): Promise<void> {
  if (msg.audio_base64) {
    const audioBytes = Buffer.from(msg.audio_base64, "base64");
    const vrm = new Vrm(config.homunculus.entity_id);
    await vrm.speakWithTimeline(audioBytes, msg.keyframes);
  }
  await signals.send("dm-tts-chunk", {
    sequence: msg.sequence,
    text: msg.text,
    emotion: msg.emotion,
  });
}

let _ws: WebSocket | null = null;

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
      sendWsMessage({ type: "chat_message", content, session_id });
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
    handleMessage(event, config).catch(console.error);
  });

  ws.addEventListener("close", async (event) => {
    await handleClose(event, config, retryState);
  });
}

async function handleClose(
  event: CloseEvent,
  config: Config,
  retryState: RetryState,
): Promise<void> {
  const code = event.code;

  if (code === 4001) {
    await signals.send("dm-connection-status", { status: "disconnected" });
    return;
  }
  if (code === 4002 || code === 4003 || code === 4004) {
    return;
  }
  if (!shouldRetry(code)) return;

  const delay = nextRetryDelay(retryState);
  if (delay === null) {
    await signals.send("dm-connection-status", { status: "restart-required" });
    return;
  }

  await new Promise((r) => setTimeout(r, delay));
  await connectWithRetry(config, { attempts: retryState.attempts + 1 });
}

async function connectAndServe(config: Config): Promise<void> {
  await signals.send("dm-config", {
    user_id: config.fastapi.user_id,
    agent_id: config.fastapi.agent_id,
    fastapi_rest_url: config.fastapi.rest_url,
  });

  const rpcServer = await startRpcServer(config);
  await connectWithRetry(config, { attempts: 0 });
  return;
}

// --- entry point ---
const config = loadConfig();
await connectAndServe(config);
