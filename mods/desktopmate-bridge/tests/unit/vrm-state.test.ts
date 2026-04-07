/**
 * vrm-state.test.ts
 *
 * Verifies that handleVrmStateChange (wired up inside spawnCharacter) invokes
 * the correct VRM methods for each state transition: idle, drag, sitting.
 *
 * Strategy:
 *   - Call connectAndServe to initialise the service and spawn the VRM.
 *   - Grab the spawned MockVrmHandle via adapter.vrmHandles[0].
 *   - Trigger state-change events via triggerStateChange() and await async side effects.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { connectAndServe } from "../../src/service.js";
import { MockAdapter } from "../../src/mock-adapter.js";
import type { MockVrmHandle } from "../../src/mock-adapter.js";
import { MockWebSocket } from "./helpers/mock-websocket.js";
import type { Config } from "../../src/config-io.js";

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

/** Flush the microtask queue so async state-change handlers complete. */
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("vrm-state: handleVrmStateChange via VRM events", () => {
  let adapter: MockAdapter;
  let vrm: MockVrmHandle;

  beforeEach(async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    adapter = new MockAdapter();
    await connectAndServe(CONFIG, adapter);
    vrm = adapter.vrmHandles[0];
    // Clear calls from initial spawnCharacter setup (playVrma for idle-maid)
    vi.clearAllMocks();
  });

  it("state 'idle' → playVrma(idle-maid) + sleep(500) + lookAtCursor", async () => {
    const sleepSpy = vi.spyOn(adapter, "sleep");

    vrm.triggerStateChange("idle");
    await flushAsync();

    expect(vrm.playVrma).toHaveBeenCalledTimes(1);
    expect(vrm.playVrma).toHaveBeenCalledWith(
      expect.objectContaining({ asset: "vrma:idle-maid" }),
    );
    expect(sleepSpy).toHaveBeenCalledWith(500);
    expect(vrm.lookAtCursor).toHaveBeenCalledTimes(1);
    expect(vrm.unlook).not.toHaveBeenCalled();
  });

  it("state 'drag' → unlook() + playVrma(grabbed, resetSpringBones: true)", async () => {
    const sleepSpy = vi.spyOn(adapter, "sleep");

    vrm.triggerStateChange("drag");
    await flushAsync();

    expect(vrm.unlook).toHaveBeenCalledTimes(1);
    expect(vrm.playVrma).toHaveBeenCalledTimes(1);
    expect(vrm.playVrma).toHaveBeenCalledWith(
      expect.objectContaining({ asset: "vrma:grabbed", resetSpringBones: true }),
    );
    expect(sleepSpy).not.toHaveBeenCalled();
    expect(vrm.lookAtCursor).not.toHaveBeenCalled();
  });

  it("state 'sitting' → playVrma(idle-sitting) + sleep(500) + lookAtCursor", async () => {
    const sleepSpy = vi.spyOn(adapter, "sleep");

    vrm.triggerStateChange("sitting");
    await flushAsync();

    expect(vrm.playVrma).toHaveBeenCalledTimes(1);
    expect(vrm.playVrma).toHaveBeenCalledWith(
      expect.objectContaining({ asset: "vrma:idle-sitting" }),
    );
    expect(sleepSpy).toHaveBeenCalledWith(500);
    expect(vrm.lookAtCursor).toHaveBeenCalledTimes(1);
    expect(vrm.unlook).not.toHaveBeenCalled();
  });
});
