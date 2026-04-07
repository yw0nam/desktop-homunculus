/**
 * MockAdapter — pure-JS SdkAdapter implementation for unit tests.
 *
 * Zero dependency on @hmcs/sdk at runtime. Activated when HMCS_MOCK=1.
 *
 * Test helpers:
 *   - onMockSignal(name, cb)  — subscribe to signals emitted by the service
 *   - callMockRpc(name, body) — invoke a registered RPC handler directly
 *   - resetMockAdapter()      — clear all state between tests
 */

import type {
  SdkAdapter,
  VrmHandle,
  VrmEvents,
  VrmStateChangeEvent,
  VrmaPlayRequest,
  TimelineKeyframe,
  SpeakTimelineOptions,
  SpawnVrmOptions,
  VrmaRepeat,
  RpcServeOptions,
  RpcServer,
} from "./sdk-adapter.js";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type SignalCallback = (payload: unknown) => void;
type RpcHandler = (params: unknown) => Promise<unknown>;

interface MockState {
  signalListeners: Map<string, SignalCallback[]>;
  rpcHandlers: Record<string, RpcHandler>;
  spawnedVrms: MockVrmHandle[];
  preferenceStore: Map<string, unknown>;
}

const _state: MockState = {
  signalListeners: new Map(),
  rpcHandlers: {},
  spawnedVrms: [],
  preferenceStore: new Map(),
};

// ---------------------------------------------------------------------------
// MockVrmEvents
// ---------------------------------------------------------------------------

class MockVrmEvents implements VrmEvents {
  private readonly listeners: Array<(e: VrmStateChangeEvent) => void | Promise<void>> = [];

  on(_event: "state-change", callback: (e: VrmStateChangeEvent) => void | Promise<void>): void {
    this.listeners.push(callback);
  }

  close(): void {
    this.listeners.length = 0;
  }

  /** Trigger a state-change event (test helper). */
  emit(event: VrmStateChangeEvent): void {
    for (const cb of this.listeners) {
      void cb(event);
    }
  }
}

// ---------------------------------------------------------------------------
// MockVrmHandle
// ---------------------------------------------------------------------------

export class MockVrmHandle implements VrmHandle {
  readonly playVrmaCalls: VrmaPlayRequest[] = [];
  readonly speakCalls: Array<{
    audio: ArrayBuffer | Uint8Array;
    keyframes: TimelineKeyframe[];
    options?: SpeakTimelineOptions;
  }> = [];
  private readonly _events = new MockVrmEvents();

  playVrma(options: VrmaPlayRequest): Promise<void> {
    this.playVrmaCalls.push(options);
    return Promise.resolve();
  }

  speakWithTimeline(
    audio: ArrayBuffer | Uint8Array,
    keyframes: TimelineKeyframe[],
    options?: SpeakTimelineOptions,
  ): Promise<void> {
    this.speakCalls.push({ audio, keyframes, options });
    return Promise.resolve();
  }

  lookAtCursor(): Promise<void> {
    return Promise.resolve();
  }

  unlook(): Promise<void> {
    return Promise.resolve();
  }

  events(): VrmEvents {
    return this._events;
  }

  /** Emit a state-change event on this handle (test helper). */
  emitStateChange(state: string): void {
    this._events.emit({ state });
  }
}

// ---------------------------------------------------------------------------
// MockRpcServer
// ---------------------------------------------------------------------------

class MockRpcServer implements RpcServer {
  readonly port = 0;

  close(): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// mockAdapter
// ---------------------------------------------------------------------------

export const mockAdapter: SdkAdapter = {
  async signalSend<V>(signal: string, payload: V): Promise<void> {
    const listeners = _state.signalListeners.get(signal) ?? [];
    for (const cb of listeners) {
      cb(payload as unknown);
    }
  },

  async vrmSpawn(_assetId: string, _options?: SpawnVrmOptions): Promise<VrmHandle> {
    const handle = new MockVrmHandle();
    _state.spawnedVrms.push(handle);
    return handle;
  },

  async rpcServe(options: RpcServeOptions): Promise<RpcServer> {
    for (const [name, entry] of Object.entries(options.methods)) {
      const method = entry;
      if (typeof method === "function") {
        _state.rpcHandlers[name] = method as RpcHandler;
      } else if (method !== null && typeof method === "object" && "handler" in method) {
        _state.rpcHandlers[name] = (method as { handler: RpcHandler }).handler;
      }
    }
    return new MockRpcServer();
  },

  async preferencesLoad<V>(key: string): Promise<V | undefined> {
    return _state.preferenceStore.get(key) as V | undefined;
  },

  repeat: {
    forever(): VrmaRepeat {
      return { type: "forever" };
    },
  },

  sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Subscribe to a signal emitted by the service under test.
 *
 * @example
 * ```typescript
 * const received: unknown[] = [];
 * onMockSignal("dm-connection-status", (p) => received.push(p));
 * ```
 */
export function onMockSignal(name: string, callback: (payload: unknown) => void): void {
  const list = _state.signalListeners.get(name) ?? [];
  list.push(callback);
  _state.signalListeners.set(name, list);
}

/**
 * Invoke a registered RPC handler directly, bypassing HTTP transport.
 *
 * @example
 * ```typescript
 * const result = await callMockRpc("getStatus", {});
 * ```
 */
export async function callMockRpc(name: string, body: unknown = {}): Promise<unknown> {
  const handler = _state.rpcHandlers[name];
  if (!handler) throw new Error(`Mock RPC method not registered: ${name}`);
  return handler(body);
}

/**
 * Clear all mock state (signal listeners, RPC handlers, spawned VRMs, preferences).
 * Call in `beforeEach` to isolate tests.
 */
export function resetMockAdapter(): void {
  _state.signalListeners.clear();
  _state.rpcHandlers = {};
  _state.spawnedVrms.length = 0;
  _state.preferenceStore.clear();
}

/**
 * Set a preference value for the mock store (test setup helper).
 */
export function setMockPreference(key: string, value: unknown): void {
  _state.preferenceStore.set(key, value);
}

/**
 * Get the first spawned VRM handle (most tests only spawn one).
 */
export function getSpawnedVrm(index = 0): MockVrmHandle | undefined {
  return _state.spawnedVrms[index];
}
