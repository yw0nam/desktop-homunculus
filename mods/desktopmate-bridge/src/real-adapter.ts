/**
 * RealAdapter — production SdkAdapter implementation that wraps @hmcs/sdk.
 *
 * Used at runtime when HMCS_MOCK is not set.
 * Imported dynamically by service.ts to keep @hmcs/sdk out of the mock path.
 */

import { signals, Vrm, preferences, repeat as sdkRepeat, sleep as sdkSleep } from "@hmcs/sdk";
import { rpc } from "@hmcs/sdk/rpc";
import type {
  SdkAdapter,
  VrmHandle,
  VrmEvents,
  VrmStateChangeEvent,
  VrmaPlayRequest,
  TimelineKeyframe,
  SpeakTimelineOptions,
  SpawnVrmOptions,
  RpcServeOptions,
  RpcServer,
} from "./sdk-adapter.js";

class RealVrmEvents implements VrmEvents {
  constructor(private readonly src: import("@hmcs/sdk").VrmEventSource) {}

  on(event: "state-change", callback: (e: VrmStateChangeEvent) => void | Promise<void>): void {
    this.src.on(event, callback);
  }

  close(): void {
    this.src.close();
  }
}

class RealVrmHandle implements VrmHandle {
  constructor(private readonly vrm: Vrm) {}

  playVrma(options: VrmaPlayRequest): Promise<void> {
    return this.vrm.playVrma(options);
  }

  speakWithTimeline(
    audio: ArrayBuffer | Uint8Array,
    keyframes: TimelineKeyframe[],
    options?: SpeakTimelineOptions,
  ): Promise<void> {
    return this.vrm.speakWithTimeline(audio, keyframes, options);
  }

  lookAtCursor(): Promise<void> {
    return this.vrm.lookAtCursor();
  }

  unlook(): Promise<void> {
    return this.vrm.unlook();
  }

  events(): VrmEvents {
    return new RealVrmEvents(this.vrm.events());
  }
}

export const realAdapter: SdkAdapter = {
  async signalSend<V>(signal: string, payload: V): Promise<void> {
    await signals.send(signal, payload);
  },

  async vrmSpawn(assetId: string, options?: SpawnVrmOptions): Promise<VrmHandle> {
    const vrm = await Vrm.spawn(assetId, options);
    return new RealVrmHandle(vrm);
  },

  async rpcServe(options: RpcServeOptions): Promise<RpcServer> {
    return rpc.serve(options);
  },

  async preferencesLoad<V>(key: string): Promise<V | undefined> {
    return preferences.load<V>(key);
  },

  repeat: {
    forever: () => sdkRepeat.forever(),
  },

  sleep: (ms: number) => sdkSleep(ms).then(() => undefined),
};
