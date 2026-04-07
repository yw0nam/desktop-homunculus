/**
 * MockAdapter — pure-JS SdkAdapter implementation for unit tests.
 *
 * Zero dependency on @hmcs/sdk at runtime. Activated when HMCS_MOCK=1.
 *
 * Test helpers:
 *   - onMockSignal(adapter, name)       — get collected signal payloads
 *   - callMockRpc(adapter, method, body) — invoke a registered RPC handler directly
 *   - resetMockAdapter(adapter)          — clear all adapter state between tests
 */

import { vi } from "vitest";
import type {
  SdkAdapter,
  VrmHandle,
  VrmEvents,
  VrmaPlayRequest,
  TimelineKeyframe,
  SpeakTimelineOptions,
  SpawnVrmOptions,
  VrmaRepeat,
  RpcServeOptions,
  RpcServer,
} from "./sdk-adapter.js";

// ---------------------------------------------------------------------------
// MockVrmHandle
// ---------------------------------------------------------------------------

export class MockVrmHandle implements VrmHandle {
  readonly stateChangeHandlers: Array<(e: { state: string }) => void> = [];

  playVrma = vi.fn((_opts: VrmaPlayRequest): Promise<void> => Promise.resolve());
  speakWithTimeline = vi.fn(
    (_audio: ArrayBuffer | Uint8Array, _kf: TimelineKeyframe[], _opts?: SpeakTimelineOptions): Promise<void> =>
      Promise.resolve(),
  );
  lookAtCursor = vi.fn((): Promise<void> => Promise.resolve());
  unlook = vi.fn((): Promise<void> => Promise.resolve());

  events(): VrmEvents {
    return {
      on: (_event: "state-change", handler: (e: { state: string }) => void) => {
        this.stateChangeHandlers.push(handler);
      },
    };
  }

  /** Trigger a state-change event on this handle (test helper). */
  triggerStateChange(state: string): void {
    for (const handler of this.stateChangeHandlers) {
      handler({ state });
    }
  }
}

// ---------------------------------------------------------------------------
// MockAdapter
// ---------------------------------------------------------------------------

type RpcHandler = (params: unknown) => Promise<unknown>;

export class MockAdapter implements SdkAdapter {
  readonly signals = new Map<string, unknown[]>();
  readonly rpcHandlers = new Map<string, RpcHandler>();
  readonly vrmHandles: MockVrmHandle[] = [];

  async signalSend<V>(signal: string, payload: V): Promise<void> {
    const arr = this.signals.get(signal) ?? [];
    arr.push(payload);
    this.signals.set(signal, arr);
  }

  async vrmSpawn(_assetId: string, _options?: SpawnVrmOptions): Promise<VrmHandle> {
    const handle = new MockVrmHandle();
    this.vrmHandles.push(handle);
    return handle;
  }

  async rpcServe(options: RpcServeOptions): Promise<RpcServer> {
    for (const [name, entry] of Object.entries(options.methods)) {
      const handler = (entry as { handler: RpcHandler }).handler;
      this.rpcHandlers.set(name, handler);
    }
    return { port: 0, close: () => Promise.resolve() };
  }

  async preferencesLoad<V>(_key: string): Promise<V | undefined> {
    return undefined;
  }

  repeat = {
    forever(): VrmaRepeat {
      return { type: "forever" as const };
    },
  };

  sleep = (_ms: number): Promise<void> => Promise.resolve();

  reset(): void {
    this.signals.clear();
    this.rpcHandlers.clear();
    this.vrmHandles.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Return the collected payloads for a signal emitted by the service.
 *
 * @example
 * ```typescript
 * const adapter = new MockAdapter();
 * // ... run service logic ...
 * expect(onMockSignal(adapter, "dm-connection-status")).toContainEqual({ status: "connected" });
 * ```
 */
export function onMockSignal(adapter: MockAdapter, name: string): unknown[] {
  return adapter.signals.get(name) ?? [];
}

/**
 * Invoke a registered RPC handler directly, bypassing HTTP transport.
 *
 * @example
 * ```typescript
 * const result = await callMockRpc(adapter, "getStatus", {});
 * ```
 */
export async function callMockRpc(
  adapter: MockAdapter,
  method: string,
  params: unknown = {},
): Promise<unknown> {
  const handler = adapter.rpcHandlers.get(method);
  if (!handler) throw new Error(`No RPC handler registered: ${method}`);
  return handler(params);
}

/**
 * Clear all adapter state (signals, RPC handlers, VRM handles).
 * Call in `beforeEach` to isolate tests.
 */
export function resetMockAdapter(adapter: MockAdapter): void {
  adapter.reset();
}
