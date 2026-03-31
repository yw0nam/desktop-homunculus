import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtsChunkQueue, type TtsChunk } from "./tts-chunk-queue";

function makeChunk(sequence: number, audio: boolean = false): TtsChunk {
  return {
    sequence,
    text: `text-${sequence}`,
    emotion: "neutral",
    audio_base64: audio ? "dGVzdA==" : null,
    keyframes: [],
  };
}

describe("TtsChunkQueue", () => {
  let processed: TtsChunk[];
  let queue: TtsChunkQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    processed = [];
    queue = new TtsChunkQueue(async (chunk) => {
      processed.push(chunk);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("in-order delivery", () => {
    it("processes chunks immediately when arriving in order", () => {
      queue.enqueue(makeChunk(0));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });
  });

  describe("out-of-order delivery", () => {
    it("buffers chunks until expected sequence arrives", () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      expect(processed).toHaveLength(0);
      queue.enqueue(makeChunk(0));
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it("processes correctly when first chunk is missing and arrives last", () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(0));
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it("drains consecutive buffered chunks after missing gap filled", () => {
      queue.enqueue(makeChunk(3));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(0));
      // seq 0 and 1 drain, but seq 3 is buffered (seq 2 missing)
      expect(processed.map((c) => c.sequence)).toEqual([0, 1]);
      queue.enqueue(makeChunk(2));
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("reset()", () => {
    it("clears buffer and resets expectedSequence to 0", () => {
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.reset();
      expect(processed).toHaveLength(0);
      queue.enqueue(makeChunk(0));
      expect(processed.map((c) => c.sequence)).toEqual([0]);
    });

    it("cancels pending timeout on reset", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(1)); // seq 0 missing
      queue.reset();
      vi.advanceTimersByTime(5000);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("flush()", () => {
    it("processes all buffered chunks in sequence order", () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      queue.flush();
      expect(processed.map((c) => c.sequence)).toEqual([1, 2]);
    });

    it("resets queue so next stream starts from sequence 0", () => {
      queue.enqueue(makeChunk(2));
      queue.flush();
      processed = [];
      queue.enqueue(makeChunk(0));
      expect(processed.map((c) => c.sequence)).toEqual([0]);
    });

    it("cancels pending timeout on flush", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(1)); // seq 0 missing
      queue.flush();
      vi.advanceTimersByTime(5000);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("timeout handling", () => {
    it("skips missing sequence and processes buffered chunks after 3s", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(1)); // seq 0 is missing
      expect(processed).toHaveLength(0);
      vi.advanceTimersByTime(3000);
      expect(processed.map((c) => c.sequence)).toEqual([1]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("0"));
      warnSpy.mockRestore();
    });

    it("chains timeouts when multiple sequences are missing", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(2)); // seq 0 and 1 missing
      vi.advanceTimersByTime(3000); // seq 0 times out
      expect(processed).toHaveLength(0); // seq 1 still missing
      vi.advanceTimersByTime(3000); // seq 1 times out
      expect(processed.map((c) => c.sequence)).toEqual([2]);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it("does not fire timeout when buffer is empty after drain", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(0));
      queue.enqueue(makeChunk(1));
      vi.advanceTimersByTime(5000);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("max buffer enforcement", () => {
    it("force-processes oldest chunks when buffer exceeds 50", () => {
      // Enqueue 51 chunks with seq 0 missing (all waiting)
      for (let i = 51; i >= 1; i--) {
        queue.enqueue(makeChunk(i));
      }
      // Buffer overflow should have triggered force-processing
      expect(processed.length).toBeGreaterThan(0);
    });

    it("processed sequences maintain correct order after overflow", () => {
      for (let i = 51; i >= 1; i--) {
        queue.enqueue(makeChunk(i));
      }
      const seqs = processed.map((c) => c.sequence);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }
    });
  });
});
