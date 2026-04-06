/**
 * Mock for @hmcs/sdk/rpc — replaces HTTP RPC calls with in-process stubs.
 * Used when VITE_TEST_MODE=true (Playwright UI E2E).
 *
 * Exposed globals for Playwright control:
 *   window.__connectionStatus__  — current status returned by getStatus
 *   window.__testConfig__        — current config returned by getStatus
 *   window.__reconnectCallCount__ — number of times reconnect() was called
 *   window.__reconnectDelay__    — ms delay for reconnect() (default 0)
 */

import type { DmConfig } from "../../src/types";

const DEFAULT_CONFIG: DmConfig = {
  user_id: "default",
  agent_id: "yuri",
  fastapi_rest_url: "http://localhost:5500",
  fastapi_ws_url: "ws://localhost:5500/v1/chat/stream",
  fastapi_token: "",
  homunculus_api_url: "http://localhost:3100",
  tts_reference_id: "",
};

declare global {
  interface Window {
    __connectionStatus__: string;
    __testConfig__: DmConfig;
    __reconnectCallCount__: number;
    __reconnectDelay__: number;
  }
}

if (window.__connectionStatus__ === undefined) window.__connectionStatus__ = "disconnected";
if (window.__testConfig__ === undefined) window.__testConfig__ = { ...DEFAULT_CONFIG };
if (window.__reconnectCallCount__ === undefined) window.__reconnectCallCount__ = 0;
if (window.__reconnectDelay__ === undefined) window.__reconnectDelay__ = 0;

export interface RpcCallOptions {
  modName: string;
  method: string;
  body?: unknown;
}

async function handleGetStatus(): Promise<unknown> {
  return {
    status: window.__connectionStatus__,
    config: { ...window.__testConfig__ },
  };
}

async function handleUpdateConfig(body: unknown): Promise<unknown> {
  const cfg = body as DmConfig;
  window.__testConfig__ = { ...window.__testConfig__, ...cfg };
  window.__signalBus__?.emit("dm-config", { ...window.__testConfig__ });
  return {};
}

function isInvalidWsUrl(url: string): boolean {
  return url.includes("invalid-host") || url.includes(":9999");
}

async function handleReconnect(): Promise<unknown> {
  window.__reconnectCallCount__ += 1;
  const delay = window.__reconnectDelay__ ?? 0;
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  const wsUrl = window.__testConfig__?.fastapi_ws_url ?? "";
  if (isInvalidWsUrl(wsUrl)) {
    setTimeout(() => {
      window.__signalBus__?.emit("dm-connection-status", { status: "disconnected" });
    }, 100);
  }
  return {};
}

export namespace rpc {
  export async function call<T = unknown>(options: RpcCallOptions): Promise<T> {
    switch (options.method) {
      case "getStatus":
        return handleGetStatus() as Promise<T>;
      case "updateConfig":
        return handleUpdateConfig(options.body) as Promise<T>;
      case "reconnect":
        return handleReconnect() as Promise<T>;
      default:
        return Promise.resolve({} as T);
    }
  }
}
