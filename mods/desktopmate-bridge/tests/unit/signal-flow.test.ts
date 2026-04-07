/**
 * signal-flow.test.ts
 *
 * Verifies that each WebSocket message type dispatches the correct signal via
 * `handleMessage` exported from service.ts.
 *
 * We call `connectAndServe` once to initialise module-level state (_ttsQueue etc.)
 * before testing `handleMessage` directly.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { handleMessage, connectAndServe } from "../../src/service.js";
import { MockAdapter, onMockSignal, resetMockAdapter } from "../../src/mock-adapter.js";
import type { Config } from "../../src/config-io.js";

// ---------------------------------------------------------------------------
// MockWebSocket — never connects, prevents real network calls
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onclose: ((e: unknown) => void) | null = null;
  addEventListener(_event: string, _handler: unknown) {}
  removeEventListener(_event: string, _handler: unknown) {}
  send(_data: string) {}
  close() { this.readyState = 3; }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: Config = {
  fastapi: {
    ws_url: "ws://localhost:9999",
    rest_url: "http://localhost:5500",
    token: "",
    user_id: "u1",
    agent_id: "a1",
  },
  homunculus: { api_url: "http://localhost:3100" },
  tts: { reference_id: "" },
};

function makeEvent(data: unknown): MessageEvent {
  return { data: JSON.stringify(data) } as MessageEvent;
}

// ---------------------------------------------------------------------------
// Module initialisation — connectAndServe sets up _ttsQueue
// ---------------------------------------------------------------------------

let sharedAdapter: MockAdapter;

beforeAll(async () => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  sharedAdapter = new MockAdapter();
  // connectAndServe initialises _ttsQueue and module-level state
  await connectAndServe(CONFIG, sharedAdapter);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signal-flow: handleMessage → correct signals emitted", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  afterEach(() => {
    resetMockAdapter(adapter);
  });

  it("authorize_success → dm-connection-status { status: 'connected' }", async () => {
    await handleMessage(
      makeEvent({ type: "authorize_success", connection_id: "conn-42" }),
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-connection-status");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ status: "connected" });
  });

  it("authorize_error → dm-connection-status { status: 'disconnected' }", async () => {
    await handleMessage(
      makeEvent({ type: "authorize_error" }),
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-connection-status");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ status: "disconnected" });
  });

  it("stream_start → dm-typing-start { turn_id, session_id }", async () => {
    await handleMessage(
      makeEvent({ type: "stream_start", turn_id: "turn-1", session_id: "sess-abc" }),
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-typing-start");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ turn_id: "turn-1", session_id: "sess-abc" });
  });

  it("stream_end → dm-message-complete { turn_id, session_id, content }", async () => {
    await handleMessage(
      makeEvent({
        type: "stream_end",
        turn_id: "turn-2",
        session_id: "sess-abc",
        content: "Hello world",
      }),
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-message-complete");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      turn_id: "turn-2",
      session_id: "sess-abc",
      content: "Hello world",
    });
  });

  it("stream_token → dm-stream-token { turn_id, chunk }", async () => {
    await handleMessage(
      makeEvent({ type: "stream_token", turn_id: "turn-3", chunk: "Hello " }),
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-stream-token");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ turn_id: "turn-3", chunk: "Hello " });
  });

  it("invalid JSON → dm-connection-status { status: 'error' }", async () => {
    await handleMessage(
      { data: "not-valid-json!!!" } as MessageEvent,
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-connection-status");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({ status: "error" });
  });
});
