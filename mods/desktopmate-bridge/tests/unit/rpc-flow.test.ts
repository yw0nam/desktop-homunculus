/**
 * rpc-flow.test.ts
 *
 * Verifies that RPC handlers registered by `connectAndServe` return the correct
 * responses and emit the expected signals.
 *
 * Each test calls `connectAndServe` with a fresh `MockAdapter` and a stubbed
 * `WebSocket` so no real network connections are made.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { connectAndServe } from "../../src/service.js";
import {
  MockAdapter,
  onMockSignal,
  callMockRpc,
  resetMockAdapter,
} from "../../src/mock-adapter.js";
import { MockWebSocket } from "./helpers/mock-websocket.js";
import type { Config } from "../../src/config-io.js";

// Prevent real filesystem writes from updateConfig handler
vi.mock("../../src/config-io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config-io.js")>();
  return {
    ...actual,
    applyConfigToDisk: (config: Config, input: Record<string, string>) => {
      // Mutate in-place without writing to disk
      config.fastapi.user_id = input.user_id;
      config.fastapi.agent_id = input.agent_id;
      config.fastapi.rest_url = input.fastapi_rest_url;
      config.fastapi.ws_url = input.fastapi_ws_url;
      config.fastapi.token = input.fastapi_token ?? "";
      config.homunculus.api_url = input.homunculus_api_url;
      config.tts.reference_id = input.tts_reference_id;
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): Config {
  return {
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rpc-flow: RPC handler responses and signals", () => {
  let adapter: MockAdapter;
  let config: Config;

  beforeEach(async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    adapter = new MockAdapter();
    config = makeConfig();
    await connectAndServe(config, adapter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetMockAdapter(adapter);
  });

  it("getStatus → returns status: 'disconnected' and config fields", async () => {
    const result = await callMockRpc(adapter, "getStatus") as {
      status: string;
      config: Record<string, string>;
    };

    expect(result.status).toBe("disconnected");
    expect(result.config.user_id).toBe("u1");
    expect(result.config.agent_id).toBe("a1");
    expect(result.config.fastapi_ws_url).toBe("ws://localhost:9999");
  });

  it("sendMessage (WS closed) → { ok: false }", async () => {
    const result = await callMockRpc(adapter, "sendMessage", {
      content: "hello",
      session_id: "sess-1",
    }) as { ok: boolean };

    // WebSocket readyState is 0 (not OPEN), so send returns false
    expect(result.ok).toBe(false);
  });

  it("updateConfig → mutates config in-place and emits dm-config signal", async () => {
    const result = await callMockRpc(adapter, "updateConfig", {
      user_id: "u2",
      agent_id: "a2",
      fastapi_rest_url: "http://new-rest",
      fastapi_ws_url: "ws://new-ws",
      fastapi_token: "new-tok",
      homunculus_api_url: "http://new-hmcs",
      tts_reference_id: "new-ref",
    }) as { ok: boolean };

    expect(result.ok).toBe(true);

    // Config object mutated in-place
    expect(config.fastapi.user_id).toBe("u2");
    expect(config.fastapi.agent_id).toBe("a2");
    expect(config.fastapi.ws_url).toBe("ws://new-ws");
    expect(config.tts.reference_id).toBe("new-ref");

    // dm-config signal emitted with new values
    const dmConfigSignals = onMockSignal(adapter, "dm-config");
    // dm-config is emitted on startup (broadcastConfig) and after updateConfig
    const lastSignal = dmConfigSignals[dmConfigSignals.length - 1] as Record<string, string>;
    expect(lastSignal).toMatchObject({
      user_id: "u2",
      agent_id: "a2",
      fastapi_ws_url: "ws://new-ws",
      tts_reference_id: "new-ref",
    });
  });

  it("reconnect → emits dm-connection-status { status: 'disconnected' }", async () => {
    const result = await callMockRpc(adapter, "reconnect") as { ok: boolean };

    expect(result.ok).toBe(true);

    const signals = onMockSignal(adapter, "dm-connection-status");
    const disconnectedSignals = signals.filter(
      (s) => (s as { status: string }).status === "disconnected",
    );
    expect(disconnectedSignals.length).toBeGreaterThanOrEqual(1);
  });
});
