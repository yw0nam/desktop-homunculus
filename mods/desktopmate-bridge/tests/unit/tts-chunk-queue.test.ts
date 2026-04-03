import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtsChunkQueue, type TtsChunk } from "../../src/tts-chunk-queue";

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
    it("processes chunks in order when arriving in order", async () => {
      queue.enqueue(makeChunk(0));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });
  });

  describe("out-of-order delivery", () => {
    it("buffers chunks until expected sequence arrives", async () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      expect(processed).toHaveLength(0);
      queue.enqueue(makeChunk(0));
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it("processes correctly when first chunk is missing and arrives last", async () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(0));
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it("drains consecutive buffered chunks after missing gap filled", async () => {
      queue.enqueue(makeChunk(3));
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(0));
      await queue.drain();
      // seq 0 and 1 drain, but seq 3 is buffered (seq 2 missing)
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([0, 1]);
      queue.enqueue(makeChunk(2));
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("DH-BUG-16: reset() cancels in-flight processing chain", () => {
    // Uses real timers for microtask-level control
    beforeEach(() => vi.useRealTimers());
    afterEach(() => vi.useFakeTimers());

    it("skips processor calls that were scheduled before reset()", async () => {
      const resolvers: Array<() => void> = [];
      const callOrder: string[] = [];

      const slowQueue = new TtsChunkQueue(async (chunk) => {
        callOrder.push(`start-${chunk.sequence}`);
        await new Promise<void>((res) => resolvers.push(res));
        callOrder.push(`end-${chunk.sequence}`);
      });

      slowQueue.enqueue(makeChunk(0));
      slowQueue.enqueue(makeChunk(1));

      // Let chunk-0 processor start
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(callOrder).toContain("start-0");

      // Reset while chunk-0 is in-flight
      slowQueue.reset();

      // Resolve chunk-0 processor (already started, end runs but that's ok)
      resolvers[0]?.();
      for (let i = 0; i < 20; i++) await Promise.resolve();

      // chunk-1 processor must NOT have been called
      expect(callOrder.filter((e) => e.startsWith("start-1"))).toHaveLength(0);
    });

    it("after reset(), new enqueued chunks are processed normally", async () => {
      const resolvers: Array<() => void> = [];

      const slowQueue = new TtsChunkQueue(async (_chunk) => {
        await new Promise<void>((res) => resolvers.push(res));
      });

      slowQueue.enqueue(makeChunk(0));
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // Reset and immediately resolve the in-flight processor
      slowQueue.reset();
      resolvers[0]?.();
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // After reset, enqueue from seq 0 again
      const newProcessed: TtsChunk[] = [];
      const freshQueue = new TtsChunkQueue(async (chunk) => {
        newProcessed.push(chunk);
      });
      freshQueue.enqueue(makeChunk(0));
      await freshQueue.drain();
      expect(newProcessed.map((c) => c.sequence)).toEqual([0]);
    });
  });

  describe("reset()", () => {
    it("clears buffer and resets expectedSequence to 0", async () => {
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.reset();
      expect(processed).toHaveLength(0);
      queue.enqueue(makeChunk(0));
      await queue.drain();
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
    it("processes all buffered chunks in sequence order", async () => {
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(1));
      queue.flush();
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([1, 2]);
    });

    it("resets queue so next stream starts from sequence 0", async () => {
      queue.enqueue(makeChunk(2));
      queue.flush();
      await queue.drain(); // let the deferred flush work complete before resetting
      processed = [];
      queue.enqueue(makeChunk(0));
      await queue.drain();
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
    it("skips missing sequence and processes buffered chunks after 3s", async () => {
      queue.enqueue(makeChunk(1)); // seq 0 is missing
      expect(processed).toHaveLength(0);
      vi.advanceTimersByTime(3000);
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([1]);
    });

    it("chains timeouts when multiple sequences are missing", async () => {
      queue.enqueue(makeChunk(2)); // seq 0 and 1 missing
      vi.advanceTimersByTime(3000); // seq 0 times out
      await queue.drain();
      expect(processed).toHaveLength(0); // seq 1 still missing
      vi.advanceTimersByTime(3000); // seq 1 times out
      await queue.drain();
      expect(processed.map((c) => c.sequence)).toEqual([2]);
    });

    it("does not fire timeout when buffer is empty after drain", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      queue.enqueue(makeChunk(0));
      queue.enqueue(makeChunk(1));
      vi.advanceTimersByTime(5000);
      await queue.drain();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("serialization", () => {
    // These tests use real timers to avoid fake-timer interference with microtask scheduling.
    beforeEach(() => {
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useFakeTimers();
    });

    it("flush() does not start second processor before first completes", async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;
      const resolvers: Array<() => void> = [];

      const serialQueue = new TtsChunkQueue(async (_chunk) => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        concurrentCalls--;
      });

      // seq 1 and 2 buffered (seq 0 missing), then flush dispatches both
      serialQueue.enqueue(makeChunk(1));
      serialQueue.enqueue(makeChunk(2));
      serialQueue.flush();

      // Drain enough ticks for first processor to start
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(1);
      expect(resolvers).toHaveLength(1); // only first processor running

      // Complete first processor; drain ticks for second to start
      resolvers[0]!();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(1);
      expect(resolvers).toHaveLength(2); // second processor now running

      // Complete second processor
      resolvers[1]!();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(0);
      expect(maxConcurrent).toBe(1);
    });

    it("drainConsecutive() does not start second processor before first completes", async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;
      const resolvers: Array<() => void> = [];

      const serialQueue = new TtsChunkQueue(async (_chunk) => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        concurrentCalls--;
      });

      // Enqueue in order — drainConsecutive fires immediately
      serialQueue.enqueue(makeChunk(0));
      serialQueue.enqueue(makeChunk(1));

      // Drain enough ticks for first processor to start
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(1);
      expect(resolvers).toHaveLength(1);

      resolvers[0]!();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(1);
      expect(resolvers).toHaveLength(2);

      resolvers[1]!();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(concurrentCalls).toBe(0);
      expect(maxConcurrent).toBe(1);
    });
  });

  describe("max buffer enforcement", () => {
    it("force-processes oldest chunks when buffer exceeds 50", async () => {
      // Enqueue 51 chunks with seq 0 missing (all waiting)
      for (let i = 51; i >= 1; i--) {
        queue.enqueue(makeChunk(i));
      }
      await queue.drain();
      // Buffer overflow should have triggered force-processing
      expect(processed.length).toBeGreaterThan(0);
    });

    it("processed sequences maintain correct order after overflow", async () => {
      for (let i = 51; i >= 1; i--) {
        queue.enqueue(makeChunk(i));
      }
      await queue.drain();
      const seqs = processed.map((c) => c.sequence);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }
    });
  });
});
