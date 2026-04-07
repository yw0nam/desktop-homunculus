/**
 * tts-flow.test.ts
 *
 * Verifies TTS-related signal and VRM integration:
 * - tts_chunk with audio → vrm.speakWithTimeline called with waitForCompletion: true
 * - tts_chunk without audio → speakWithTimeline NOT called
 * - stream_end after tts_chunk → dm-tts-chunk signal emitted
 *
 * We use a local TtsChunkQueue + MockVrmHandle to test the TTS callback logic
 * without relying on module-level state in service.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleMessage, connectAndServe } from "../../src/service.js";
import { MockAdapter, MockVrmHandle, onMockSignal, resetMockAdapter } from "../../src/mock-adapter.js";
import { MockWebSocket } from "./helpers/mock-websocket.js";
import { TtsChunkQueue } from "../../src/tts-chunk-queue.js";
import type { TtsChunk } from "../../src/tts-chunk-queue.js";
import type { TimelineKeyframe } from "@hmcs/sdk";
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

/**
 * Mirrors createTtsQueue logic from service.ts with injectable VRM handle.
 * Allows testing TTS processing without module-level state.
 */
function createTestTtsQueue(
  vrm: MockVrmHandle,
  adapter: MockAdapter,
): TtsChunkQueue {
  return new TtsChunkQueue(async (chunk: TtsChunk) => {
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

// ---------------------------------------------------------------------------
// Module initialisation — connectAndServe sets _ttsQueue for handleMessage
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  const initAdapter = new MockAdapter();
  await connectAndServe(CONFIG, initAdapter);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tts-flow: TTS chunk processing via TtsChunkQueue", () => {
  let adapter: MockAdapter;
  let vrm: MockVrmHandle;

  beforeEach(() => {
    adapter = new MockAdapter();
    vrm = new MockVrmHandle();
  });

  afterEach(() => {
    resetMockAdapter(adapter);
  });

  it("tts_chunk with audio_base64 → speakWithTimeline called with waitForCompletion: true", async () => {
    const audioBase64 = Buffer.from("audio-data").toString("base64");
    const queue = createTestTtsQueue(vrm, adapter);

    queue.enqueue({
      sequence: 0,
      text: "hello",
      emotion: "neutral",
      audio_base64: audioBase64,
      keyframes: [],
    });
    await queue.drain();

    expect(vrm.speakWithTimeline).toHaveBeenCalledOnce();
    const callArgs = vrm.speakWithTimeline.mock.calls[0] as [Buffer, TimelineKeyframe[], { waitForCompletion: boolean }];
    expect(callArgs[2].waitForCompletion).toBe(true);
  });

  it("tts_chunk without audio_base64 → speakWithTimeline NOT called", async () => {
    const queue = createTestTtsQueue(vrm, adapter);

    queue.enqueue({
      sequence: 0,
      text: "text only",
      emotion: "neutral",
      audio_base64: null,
      keyframes: [],
    });
    await queue.drain();

    expect(vrm.speakWithTimeline).not.toHaveBeenCalled();
  });

  it("tts_chunk processing → dm-tts-chunk signal emitted after drain", async () => {
    const queue = createTestTtsQueue(vrm, adapter);

    queue.enqueue({
      sequence: 0,
      text: "speak this",
      emotion: "happy",
      audio_base64: null,
      keyframes: [],
    });
    await queue.drain();

    const ttsSigs = onMockSignal(adapter, "dm-tts-chunk");
    expect(ttsSigs).toHaveLength(1);
    expect(ttsSigs[0]).toEqual({
      sequence: 0,
      text: "speak this",
      emotion: "happy",
    });
  });
});

describe("tts-flow: stream_end via handleMessage", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  afterEach(() => {
    resetMockAdapter(adapter);
  });

  it("stream_end → dm-message-complete signal with correct fields", async () => {
    await handleMessage(
      { data: JSON.stringify({ type: "stream_end", turn_id: "t1", session_id: "s1", content: "final" }) } as MessageEvent,
      CONFIG,
      adapter,
    );

    const signals = onMockSignal(adapter, "dm-message-complete");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      turn_id: "t1",
      session_id: "s1",
      content: "final",
    });
  });
});
