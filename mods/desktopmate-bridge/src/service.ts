import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TimelineKeyframe, TransformArgs } from "@hmcs/sdk";
import { rpc } from "@hmcs/sdk/rpc";
import { z } from "zod";
import { listWindows, captureScreen, captureWindow } from "./screen-capture.js";
import { TtsChunkQueue, type TtsChunk } from "./tts-chunk-queue.js";
import { type Config, applyConfigToDisk, loadConfigFrom } from "./config-io.js";
import type { SdkAdapter, VrmHandle, VrmaRepeat, RpcServer } from "./sdk-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../config.yaml");

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 3000];

interface RetryState {
  attempts: number;
}

function shouldRetry(code: number): boolean {
  return code === 4000 || code === 1011 || code === 1006;
}

function nextRetryDelay(state: RetryState): number | null {
  if (state.attempts >= MAX_RETRIES) return null;
  return RETRY_DELAYS_MS[state.attempts] ?? null;
}

export async function handleMessage(
  event: MessageEvent,
  config: Config,
  adapter: SdkAdapter,
): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(event.data as string) as Record<string, unknown>;
  } catch {
    await adapter.signalSend("dm-connection-status", { status: "error" });
    return;
  }
  switch (msg.type) {
    case "authorize_success":
      _connectionId = (msg.connection_id as string | undefined) ?? null;
      _connectionStatus = "connected";
      await adapter.signalSend("dm-connection-status", { status: "connected" });
      break;
    case "authorize_error":
      _authFailed = true;
      _connectionStatus = "disconnected";
      await adapter.signalSend("dm-connection-status", { status: "disconnected" });
      break;
    case "stream_start":
      _ttsQueue.reset();
      await adapter.signalSend("dm-typing-start", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
      });
      break;
    case "tts_chunk":
      _ttsQueue.enqueue(msg as TtsChunk);
      break;
    case "stream_end":
      _ttsQueue.flush();
      await adapter.signalSend("dm-message-complete", {
        turn_id: msg.turn_id,
        session_id: msg.session_id,
        content: msg.content,
      });
      break;
    case "stream_token":
      await adapter.signalSend("dm-stream-token", {
        turn_id: msg.turn_id,
        chunk: msg.chunk,
      });
      break;
    case "ping":
      sendWsMessage({ type: "pong" });
      break;
  }
}

function createTtsQueue(vrm: VrmHandle, adapter: SdkAdapter): TtsChunkQueue {
  return new TtsChunkQueue(async (chunk) => {
    if (chunk.audio_base64) {
      const audioBytes = Buffer.from(chunk.audio_base64, "base64");
      await vrm.speakWithTimeline(audioBytes, chunk.keyframes as TimelineKeyframe[], {
        waitForCompletion: true,
      });
    }
    await adapter.signalSend("dm-tts-chunk", {
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

function sendWsMessage(payload: unknown): boolean {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function startRpcServer(config: Config, vrm: VrmHandle, adapter: SdkAdapter): Promise<RpcServer> {
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
      const sent = sendWsMessage({
        type: "chat_message",
        content,
        session_id,
        user_id: config.fastapi.user_id,
        agent_id: config.fastapi.agent_id,
        reference_id: config.tts.reference_id || undefined,
        images,
      });
      return { ok: sent };
    },
  });
  const interruptStream = rpc.method({
    description: "Interrupt current AI stream",
    handler: async () => {
      const sent = sendWsMessage({ type: "interrupt_stream" });
      return { ok: sent };
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
      applyConfigToDisk(config, input, CONFIG_PATH);
      await broadcastConfig(config, adapter);
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
      await adapter.signalSend("dm-connection-status", { status: "disconnected" });
      connectWithRetry(config, vrm, adapter, { attempts: 0 }).catch(console.error);
      return { ok: true };
    },
  });
  return adapter.rpcServe({
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
  vrm: VrmHandle,
  adapter: SdkAdapter,
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

  ws.addEventListener("error", (event) => {
    console.error("[desktopmate-bridge] WebSocket error:", event);
  });

  ws.addEventListener("message", (event) => {
    handleMessage(event, config, adapter).catch(console.error);
  });

  ws.addEventListener("close", async (event) => {
    if (ws !== _ws) return; // stale socket: reconnect replaced this socket, ignore
    await handleClose(event, config, vrm, adapter, retryState);
  });
}

async function handleClose(
  event: CloseEvent,
  config: Config,
  vrm: VrmHandle,
  adapter: SdkAdapter,
  retryState: RetryState,
): Promise<void> {
  const code = event.code;

  // 4001 or authorize_error already sent disconnected signal
  if (code === 4001 || _authFailed) return;
  // spec: 4002 wait stream_end, 4003 normal close, 4004 no-op
  if (code === 4002 || code === 4003 || code === 4004) return;
  if (!shouldRetry(code)) {
    _connectionStatus = "disconnected";
    await adapter.signalSend("dm-connection-status", { status: "disconnected" });
    return;
  }

  const delay = nextRetryDelay(retryState);
  if (delay === null) {
    _connectionStatus = "restart-required";
    await adapter.signalSend("dm-connection-status", { status: "restart-required" });
    return;
  }

  await new Promise((r) => setTimeout(r, delay));
  await connectWithRetry(config, vrm, adapter, { attempts: retryState.attempts + 1 });
}

// TODO: make VRM asset configurable via UI settings
const CHARACTER_ASSET_ID = "desktopmate-bridge:elmer";

async function handleVrmStateChange(
  e: { state: string },
  vrm: VrmHandle,
  animOpts: { repeat: VrmaRepeat; transitionSecs: number },
): Promise<void> {
  if (e.state === "idle") {
    await vrm.playVrma({ asset: "vrma:idle-maid", ...animOpts });
    await new Promise((r) => setTimeout(r, 500));
    await vrm.lookAtCursor();
  } else if (e.state === "drag") {
    await vrm.unlook();
    await vrm.playVrma({ asset: "vrma:grabbed", ...animOpts, resetSpringBones: true });
  } else if (e.state === "sitting") {
    await vrm.playVrma({ asset: "vrma:idle-sitting", ...animOpts });
    await new Promise((r) => setTimeout(r, 500));
    await vrm.lookAtCursor();
  }
}

async function spawnCharacter(adapter: SdkAdapter): Promise<VrmHandle> {
  const transform = await adapter.preferencesLoad<TransformArgs>(`transform::${CHARACTER_ASSET_ID}`);
  const vrm = await adapter.vrmSpawn(CHARACTER_ASSET_ID, { transform });
  const animOpts = { repeat: adapter.repeat.forever(), transitionSecs: 0.5 };

  await vrm.playVrma({ asset: "vrma:idle-maid", ...animOpts });

  vrm.events().on("state-change", (e) =>
    handleVrmStateChange(e, vrm, animOpts).catch(console.error),
  );

  return vrm;
}

async function broadcastConfig(config: Config, adapter: SdkAdapter): Promise<void> {
  await adapter.signalSend("dm-config", {
    user_id: config.fastapi.user_id,
    agent_id: config.fastapi.agent_id,
    fastapi_rest_url: config.fastapi.rest_url,
    fastapi_ws_url: config.fastapi.ws_url,
    homunculus_api_url: config.homunculus.api_url,
    tts_reference_id: config.tts.reference_id,
  });
}

export async function connectAndServe(config: Config, adapter: SdkAdapter): Promise<void> {
  const vrm = await spawnCharacter(adapter);
  _ttsQueue = createTtsQueue(vrm, adapter);
  await broadcastConfig(config, adapter);
  // TODO: store rpcServer and call rpcServer.stop() on graceful shutdown
  // Requires @hmcs/sdk to expose a stop() API on the returned server handle.
  await startRpcServer(config, vrm, adapter);
  await connectWithRetry(config, vrm, adapter, { attempts: 0 });
}

// --- entry point ---
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { RealAdapter } = await import("./real-adapter.js");
  const adapter = new RealAdapter();
  const config = loadConfigFrom(CONFIG_PATH);
  connectAndServe(config, adapter).catch(console.error);
}
