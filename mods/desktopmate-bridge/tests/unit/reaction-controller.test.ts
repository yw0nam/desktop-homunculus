import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReactionController, type ReactionConfig } from "../../src/reaction-controller";
import { TtsChunkQueue } from "../../src/tts-chunk-queue";

// --- mocks ---

const { mockActiveWin } = vi.hoisted(() => ({
  mockActiveWin: vi.fn().mockResolvedValue({ title: "VSCode", owner: { name: "Code" } }),
}));

vi.mock("active-win", () => ({ default: mockActiveWin }));

const mockSpeakWithTimeline = vi.fn().mockResolvedValue(undefined);
const mockVrm = {
  speakWithTimeline: mockSpeakWithTimeline,
} as unknown as import("@hmcs/sdk").Vrm;

const mockFetch = vi.fn();

// --- helpers ---

function makeConfig(overrides: Partial<ReactionConfig> = {}): ReactionConfig {
  return {
    click_phrases: ["やだ！", "なぁに？"],
    idle_phrases: ["退屈だなぁ...", "ねぇ、遊ぼうよ！"],
    window_phrases: ["{title}を使ってるんだ！", "{title}？面白そう！"],
    idle_timeout_ms: 300,        // 300ms for fast test
    window_check_interval_ms: 50,
    ...overrides,
  };
}

function makeTtsQueue(): TtsChunkQueue {
  return new TtsChunkQueue(vi.fn().mockResolvedValue(undefined));
}

function mockTtsResponse(audioBase64 = "dGVzdA==") {
  mockFetch.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ audio_base64: audioBase64 }),
  });
}

// --- tests ---

describe("TtsChunkQueue.isBusy()", () => {
  it("returns false when queue is empty and idle", async () => {
    const queue = makeTtsQueue();
    expect(queue.isBusy()).toBe(false);
  });

  it("returns true while a chunk is being processed", async () => {
    let resolveProcessor!: () => void;
    const pending = new Promise<void>((res) => { resolveProcessor = res; });
    const queue = new TtsChunkQueue(async () => { await pending; });

    queue.enqueue({ sequence: 0, text: "hi", emotion: "neutral", audio_base64: null, keyframes: [] });

    // Allow the processing to start
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.isBusy()).toBe(true);

    resolveProcessor();
    await queue.drain();
    expect(queue.isBusy()).toBe(false);
  });
});

describe("ReactionController — click trigger", () => {
  let ctrl: ReactionController;
  let queue: TtsChunkQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockSpeakWithTimeline.mockClear();
    queue = makeTtsQueue();
    ctrl = new ReactionController(mockVrm, queue, "http://localhost:5500", makeConfig());
  });

  afterEach(() => {
    ctrl.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls TTS endpoint with a click phrase on primary click", async () => {
    mockTtsResponse();
    await ctrl.onPrimaryClick();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/tts/speak");
    const body = JSON.parse(opts.body as string) as { text: string };
    expect(["やだ！", "なぁに？"]).toContain(body.text);
  });

  it("calls vrm.speakWithTimeline with decoded audio bytes", async () => {
    mockTtsResponse("dGVzdA=="); // base64 of "test"
    await ctrl.onPrimaryClick();

    expect(mockSpeakWithTimeline).toHaveBeenCalledOnce();
    const [audioArg] = mockSpeakWithTimeline.mock.calls[0] as [Buffer, unknown[], unknown];
    expect(Buffer.isBuffer(audioArg)).toBe(true);
    expect(audioArg.toString()).toBe("test");
  });

  it("skips reaction if TTS queue is busy", async () => {
    // Make queue busy
    vi.spyOn(queue, "isBusy").mockReturnValue(true);

    await ctrl.onPrimaryClick();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSpeakWithTimeline).not.toHaveBeenCalled();
  });

  it("does not throw when TTS fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    await expect(ctrl.onPrimaryClick()).resolves.not.toThrow();
  });
});

describe("ReactionController — idle trigger", () => {
  let ctrl: ReactionController;
  let queue: TtsChunkQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockSpeakWithTimeline.mockClear();
    queue = makeTtsQueue();
    ctrl = new ReactionController(mockVrm, queue, "http://localhost:5500", makeConfig({ idle_timeout_ms: 500 }));
    ctrl.start();
  });

  afterEach(() => {
    ctrl.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires idle reaction after idle_timeout_ms", async () => {
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(500);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { text: string };
    expect(["退屈だなぁ...", "ねぇ、遊ぼうよ！"]).toContain(body.text);
  });

  it("resets idle timer on primary click", async () => {
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(400);
    await ctrl.onPrimaryClick(); // resets timer
    await vi.advanceTimersByTimeAsync(400); // still under total 500 from last reset

    // Should have been called exactly once for the click, not for idle
    const calls = mockFetch.mock.calls.map(([, opts]) => {
      const body = JSON.parse((opts as RequestInit).body as string) as { text: string };
      return body.text;
    });
    const idleCalled = calls.some((t) => ["退屈だなぁ...", "ねぇ、遊ぼうよ！"].includes(t));
    expect(idleCalled).toBe(false);
  });

  it("skips idle reaction if TTS queue is busy", async () => {
    vi.spyOn(queue, "isBusy").mockReturnValue(true);
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(500);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("ReactionController — window/context trigger", () => {
  let ctrl: ReactionController;
  let queue: TtsChunkQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockSpeakWithTimeline.mockClear();
    mockActiveWin.mockResolvedValue({ title: "VSCode", owner: { name: "Code" } });
    queue = makeTtsQueue();
    ctrl = new ReactionController(mockVrm, queue, "http://localhost:5500", makeConfig({ window_check_interval_ms: 100 }));
    ctrl.start();
  });

  afterEach(() => {
    ctrl.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires window reaction when focused window title changes", async () => {
    // First tick: sets initial title (VSCode) — no reaction on first observation
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(100);
    mockFetch.mockClear();

    // Now change the window title
    mockActiveWin.mockResolvedValue({ title: "Chrome", owner: { name: "Chrome" } });
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(100);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((opts as RequestInit).body as string) as { text: string };
    expect(body.text).toMatch(/Chrome/);
  });

  it("does NOT fire for the same window title twice in a row", async () => {
    mockTtsResponse();
    // First tick: VSCode detected (sets initial)
    await vi.advanceTimersByTimeAsync(100);
    mockFetch.mockClear();

    // Second tick: same title
    await vi.advanceTimersByTimeAsync(100);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips window reaction if TTS queue is busy", async () => {
    // Skip past initial window detection
    await vi.advanceTimersByTimeAsync(100);
    mockFetch.mockClear();

    vi.spyOn(queue, "isBusy").mockReturnValue(true);
    mockActiveWin.mockResolvedValue({ title: "Slack", owner: { name: "Slack" } });
    mockTtsResponse();
    await vi.advanceTimersByTimeAsync(100);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
