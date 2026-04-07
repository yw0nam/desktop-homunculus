/**
 * SdkAdapter — abstraction layer over @hmcs/sdk for desktopmate-bridge service.
 *
 * Decouples service.ts from the concrete SDK so unit tests can run without
 * a live Bevy runtime. Production code uses RealAdapter; tests use MockAdapter.
 *
 * Implementations:
 *  - `src/real-adapter.ts`  — wraps @hmcs/sdk (production)
 *  - `src/mock-adapter.ts`  — pure JS mock + test helpers (HMCS_MOCK=1)
 */

import type {
  VrmaPlayRequest,
  TimelineKeyframe,
  SpeakTimelineOptions,
  VrmaRepeat,
  SpawnVrmOptions,
} from "@hmcs/sdk";
import type { RpcServeOptions, RpcServer } from "@hmcs/sdk/rpc";

export type { VrmaPlayRequest, TimelineKeyframe, SpeakTimelineOptions, VrmaRepeat, SpawnVrmOptions };
export type { RpcServeOptions, RpcServer };

/**
 * Minimal VRM event subscription interface.
 *
 * Defined locally (not VrmEventSource from @hmcs/sdk) so mock implementations
 * have no runtime dependency on the SDK.
 */
export interface VrmEvents {
  on(event: "state-change", handler: (e: { state: string }) => void): void;
}

/**
 * A handle to a spawned VRM character, exposing the subset of Vrm methods
 * used by desktopmate-bridge service logic.
 *
 * Operations (5):
 *   1. playVrma          — play a VRMA animation
 *   2. speakWithTimeline — speak audio with lip-sync keyframes
 *   3. lookAtCursor      — enable gaze tracking toward cursor
 *   4. unlook            — disable gaze tracking
 *   5. events            — subscribe to VRM state-change events
 */
export interface VrmHandle {
  /** Play a VRMA animation on this character. */
  playVrma(options: VrmaPlayRequest): Promise<void>;

  /** Play WAV audio with synchronized expression keyframes. */
  speakWithTimeline(
    audio: ArrayBuffer | Uint8Array,
    keyframes: TimelineKeyframe[],
    options?: SpeakTimelineOptions,
  ): Promise<void>;

  /** Enable cursor gaze-tracking for this character. */
  lookAtCursor(): Promise<void>;

  /** Disable gaze-tracking for this character. */
  unlook(): Promise<void>;

  /** Subscribe to events emitted by this character (e.g. "state-change"). */
  events(): VrmEvents;
}

/**
 * SdkAdapter — abstracts the four SDK module-level operations used by
 * desktopmate-bridge, plus repeat/sleep utilities.
 *
 * Operations (4):
 *   1. signalSend      — emit a named signal to all subscribers
 *   2. vrmSpawn        — spawn a VRM character and return a VrmHandle
 *   3. rpcServe        — start the RPC HTTP server
 *   4. preferencesLoad — load a persisted preference value
 *
 * Utilities:
 *   - repeat.forever() — build an infinite-loop VrmaRepeat value
 *   - sleep(ms)        — non-blocking delay
 */
export interface SdkAdapter {
  /** Emit a named signal with the given payload to all subscribers. */
  signalSend<V>(signal: string, payload: V): Promise<void>;

  /** Spawn a VRM character from the given asset ID and return a handle. */
  vrmSpawn(assetId: string, options?: SpawnVrmOptions): Promise<VrmHandle>;

  /** Start the RPC HTTP server with the given method map. */
  rpcServe(options: RpcServeOptions): Promise<RpcServer>;

  /**
   * Load a persisted preference value by key.
   * Returns `undefined` if the key does not exist.
   */
  preferencesLoad<V>(key: string): Promise<V | undefined>;

  /** Helpers for building VrmaRepeat values. */
  repeat: {
    /** Repeat the animation forever. */
    forever(): VrmaRepeat;
  };

  /** Resolve after `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
}
