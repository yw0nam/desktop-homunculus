import type { TimelineKeyframe } from "@hmcs/sdk";

export interface TtsChunk {
  sequence: number;
  text: string;
  emotion: string;
  audio_base64: string | null;
  keyframes: TimelineKeyframe[];
}

export type ProcessChunkFn = (chunk: TtsChunk) => Promise<void>;

const TIMEOUT_MS = 3000;
const MAX_BUFFER = 50;

export class TtsChunkQueue {
  private expectedSequence = 0;
  private buffer = new Map<number, TtsChunk>();
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly processFn: ProcessChunkFn;
  // All drain work is chained here, guaranteeing serial execution.
  private drainChain: Promise<void> = Promise.resolve();

  constructor(processFn: ProcessChunkFn) {
    this.processFn = processFn;
  }

  reset(): void {
    this.expectedSequence = 0;
    this.buffer.clear();
    this.cancelTimeout();
    // Drop any pending drain work so stale items from the previous turn don't leak.
    this.drainChain = Promise.resolve();
  }

  async flush(): Promise<void> {
    // Cancel timeout first so it cannot enqueue new drain work while we wait.
    this.cancelTimeout();
    await this.drainChain;
    await this.drainBufferInOrder();
    this.reset();
  }

  /**
   * Add a chunk to the queue. Returns immediately without waiting for playback.
   * Processing runs serially in the background via the drain chain.
   */
  enqueue(chunk: TtsChunk): void {
    this.buffer.set(chunk.sequence, chunk);

    if (this.buffer.size > MAX_BUFFER) {
      this.skipGapToOldest();
    }

    this.drainChain = this.drainChain
      .then(() => this.processConsecutive())
      .catch(console.error);
  }

  /**
   * Returns a promise that resolves when all currently-queued drain work completes.
   * Useful in tests to wait for processing without resetting state.
   */
  get settled(): Promise<void> {
    return this.drainChain;
  }

  private async drainBufferInOrder(): Promise<void> {
    const sequences = [...this.buffer.keys()].sort((a, b) => a - b);
    let prev = this.expectedSequence;

    for (const seq of sequences) {
      if (seq !== prev) {
        console.warn(
          `TtsChunkQueue: flushing — skipping gap from sequence ${prev} to ${seq}`,
        );
      }
      const chunk = this.buffer.get(seq)!;
      this.buffer.delete(seq);
      await this.processFn(chunk);
      prev = seq + 1;
    }
  }

  private async processConsecutive(): Promise<void> {
    while (this.buffer.has(this.expectedSequence)) {
      this.cancelTimeout();
      const chunk = this.buffer.get(this.expectedSequence)!;
      this.buffer.delete(this.expectedSequence);
      // Increment before await so a concurrent reset() sees the updated value.
      this.expectedSequence++;
      await this.processFn(chunk);
    }

    if (this.buffer.size > 0 && this.timeoutHandle === null) {
      this.startTimeout();
    }
  }

  private skipGapToOldest(): void {
    const minSeq = Math.min(...this.buffer.keys());

    if (minSeq > this.expectedSequence) {
      console.warn(
        `TtsChunkQueue: buffer overflow — skipping sequences ${this.expectedSequence}–${minSeq - 1}`,
      );
      this.expectedSequence = minSeq;
    }
  }

  private startTimeout(): void {
    const skipped = this.expectedSequence;
    this.timeoutHandle = setTimeout(() => {
      this.timeoutHandle = null;
      console.warn(
        `TtsChunkQueue: timeout — sequence ${skipped} did not arrive, skipping`,
      );
      this.expectedSequence++;
      this.drainChain = this.drainChain
        .then(() => this.processConsecutive())
        .catch(console.error);
    }, TIMEOUT_MS);
  }

  private cancelTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
