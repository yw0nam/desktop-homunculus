export interface TtsChunk {
  sequence: number;
  text: string;
  emotion: string;
  audio_base64: string | null;
  keyframes: unknown[];
}

export type ChunkProcessor = (chunk: TtsChunk) => Promise<void>;

const TIMEOUT_MS = 3000;
const MAX_BUFFER = 50;

export class TtsChunkQueue {
  private expectedSequence = 0;
  private buffer = new Map<number, TtsChunk>();
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly processor: ChunkProcessor;

  constructor(processor: ChunkProcessor) {
    this.processor = processor;
  }

  enqueue(chunk: TtsChunk): void {
    this.buffer.set(chunk.sequence, chunk);
    if (this.buffer.size > MAX_BUFFER) {
      this.forceProcessOldest();
    }
    this.drainConsecutive();
    this.scheduleTimeout();
  }

  reset(): void {
    this.cancelTimeout();
    this.buffer.clear();
    this.expectedSequence = 0;
  }

  flush(): void {
    this.cancelTimeout();
    const sorted = [...this.buffer.keys()].sort((a, b) => a - b);
    for (const seq of sorted) {
      const chunk = this.buffer.get(seq)!;
      this.buffer.delete(seq);
      this.processor(chunk).catch(console.error);
    }
    this.expectedSequence = 0;
  }

  private drainConsecutive(): void {
    while (this.buffer.has(this.expectedSequence)) {
      const chunk = this.buffer.get(this.expectedSequence)!;
      this.buffer.delete(this.expectedSequence);
      this.processor(chunk).catch(console.error);
      this.expectedSequence++;
    }
  }

  private scheduleTimeout(): void {
    if (this.buffer.size === 0) {
      this.cancelTimeout();
      return;
    }
    this.cancelTimeout();
    this.timeoutHandle = setTimeout(() => {
      console.warn(
        `TtsChunkQueue: sequence ${this.expectedSequence} timed out after ${TIMEOUT_MS}ms, skipping`,
      );
      this.expectedSequence++;
      this.drainConsecutive();
      this.scheduleTimeout();
    }, TIMEOUT_MS);
  }

  private cancelTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private forceProcessOldest(): void {
    const minSeq = Math.min(...this.buffer.keys());
    if (minSeq > this.expectedSequence) {
      console.warn(
        `TtsChunkQueue: buffer overflow, skipping sequences ${this.expectedSequence}–${minSeq - 1}`,
      );
      this.expectedSequence = minSeq;
    }
    this.drainConsecutive();
  }
}
