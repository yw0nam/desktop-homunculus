import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtsChunkQueue, type TtsChunk } from "./tts-chunk-queue.js";

function makeChunk(sequence: number): TtsChunk {
  return {
    sequence,
    text: `text-${sequence}`,
    emotion: "neutral",
    audio_base64: null,
    keyframes: [],
  };
}

describe("TtsChunkQueue", () => {
  let processed: number[];
  let processFn: ReturnType<typeof vi.fn>;
  let queue: TtsChunkQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    processed = [];
    processFn = vi.fn(async (chunk: TtsChunk) => {
      processed.push(chunk.sequence);
    });
    queue = new TtsChunkQueue(processFn);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("in-order delivery", () => {
    it("processes chunks immediately when they arrive in order", async () => {
      await queue.enqueue(makeChunk(0));
      await queue.enqueue(makeChunk(1));
      await queue.enqueue(makeChunk(2));

      expect(processed).toEqual([0, 1, 2]);
    });
  });

  describe("reordering", () => {
    it("buffers out-of-order chunks and plays in sequence", async () => {
      await queue.enqueue(makeChunk(2));
      expect(processed).toEqual([]);

      await queue.enqueue(makeChunk(0));
      expect(processed).toEqual([0]);

      await queue.enqueue(makeChunk(1));
      expect(processed).toEqual([0, 1, 2]);
    });

    it("processes a run of buffered consecutive chunks when the gap fills", async () => {
      await queue.enqueue(makeChunk(3));
      await queue.enqueue(makeChunk(1));
      await queue.enqueue(makeChunk(2));
      expect(processed).toEqual([]);

      await queue.enqueue(makeChunk(0));
      expect(processed).toEqual([0, 1, 2, 3]);
    });
  });

  describe("reset", () => {
    it("clears buffer and resets expectedSequence to 0", async () => {
      await queue.enqueue(makeChunk(1));
      queue.reset();

      await queue.enqueue(makeChunk(0));
      expect(processed).toEqual([0]);
    });

    it("does not process buffered chunks after reset", async () => {
      await queue.enqueue(makeChunk(1));
      queue.reset();

      expect(processed).toEqual([]);
      expect(processFn).not.toHaveBeenCalled();
    });
  });

  describe("flush", () => {
    it("plays remaining buffered chunks in order on flush", async () => {
      await queue.enqueue(makeChunk(2));
      await queue.enqueue(makeChunk(1));
      expect(processed).toEqual([]);

      await queue.flush();
      expect(processed).toEqual([1, 2]);
    });

    it("skips gaps with console.warn during flush", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await queue.enqueue(makeChunk(2));
      await queue.flush();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("skipping gap"),
      );
      expect(processed).toEqual([2]);

      warnSpy.mockRestore();
    });

    it("resets state after flush", async () => {
      await queue.enqueue(makeChunk(1));
      await queue.flush();

      // After flush + reset, should start from sequence 0 again
      await queue.enqueue(makeChunk(0));
      expect(processed).toContain(0);
    });
  });

  describe("timeout", () => {
    it("skips a missing sequence after 3 seconds and processes buffered chunks", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // seq=0 is missing, seq=1 arrives
      await queue.enqueue(makeChunk(1));
      expect(processed).toEqual([]);

      // advance 3 seconds to trigger timeout
      await vi.advanceTimersByTimeAsync(3000);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("timeout"));
      expect(processed).toEqual([1]);

      warnSpy.mockRestore();
    });

    it("cancels timeout when expected sequence arrives", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await queue.enqueue(makeChunk(1));
      // seq=0 arrives before timeout
      await queue.enqueue(makeChunk(0));

      await vi.advanceTimersByTimeAsync(3000);

      // warn should NOT have been called for timeout
      const timeoutWarns = (warnSpy.mock.calls as unknown[][]).filter((args) =>
        String(args[0]).includes("timeout"),
      );
      expect(timeoutWarns).toHaveLength(0);
      expect(processed).toEqual([0, 1]);

      warnSpy.mockRestore();
    });

    it("chains timeouts to skip multiple consecutive missing sequences", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Only seq=2 in buffer; seq 0 and 1 are missing
      await queue.enqueue(makeChunk(2));
      expect(processed).toEqual([]);

      await vi.advanceTimersByTimeAsync(3000); // skip seq 0
      await vi.advanceTimersByTimeAsync(3000); // skip seq 1

      expect(processed).toEqual([2]);
      const timeoutWarns = (warnSpy.mock.calls as unknown[][]).filter((args) =>
        String(args[0]).includes("timeout"),
      );
      expect(timeoutWarns).toHaveLength(2);

      warnSpy.mockRestore();
    });
  });

  describe("max buffer (memory protection)", () => {
    it("force-processes oldest chunk when buffer exceeds 50", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Enqueue chunks 1..51 (seq=0 missing, so nothing processes normally)
      for (let i = 1; i <= 51; i++) {
        await queue.enqueue(makeChunk(i));
      }

      // At 51 entries buffer exceeds 50 → oldest forced out
      // seq=1 gets force-processed (skipping seq=0)
      expect(processed.length).toBeGreaterThan(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("buffer overflow"),
      );

      warnSpy.mockRestore();
    });
  });
});
