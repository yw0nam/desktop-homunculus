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
  private processingChain: Promise<void> = Promise.resolve();
  private generation = 0;
  private activeCount = 0;

  constructor(processor: ChunkProcessor) {
    this.processor = processor;
  }

  /** Returns true if a chunk is currently being processed or the buffer has pending chunks. */
  isBusy(): boolean {
    return this.activeCount > 0 || this.buffer.size > 0;
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
    this.generation++;
    this.processingChain = Promise.resolve();
  }

  /** Wait for all currently scheduled processor calls to complete. */
  drain(): Promise<void> {
    return this.processingChain;
  }

  flush(): void {
    this.cancelTimeout();
    const sorted = [...this.buffer.keys()].sort((a, b) => a - b);
    for (const seq of sorted) {
      const chunk = this.buffer.get(seq)!;
      this.buffer.delete(seq);
      this.scheduleProcessor(chunk);
    }
    this.expectedSequence = 0;
  }

  private scheduleProcessor(chunk: TtsChunk): void {
    const capturedGeneration = this.generation;
    this.activeCount++;
    this.processingChain = this.processingChain
      .then(() => {
        if (this.generation !== capturedGeneration) {
          this.activeCount--;
          return;
        }
        return this.processor(chunk);
      })
      .then(() => { this.activeCount--; })
      .catch((err) => { this.activeCount--; console.error(err); });
  }

  private drainConsecutive(): void {
    while (this.buffer.has(this.expectedSequence)) {
      const chunk = this.buffer.get(this.expectedSequence)!;
      this.buffer.delete(this.expectedSequence);
      this.scheduleProcessor(chunk);
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
      this.expectedSequence = minSeq;
    }
    this.drainConsecutive();
  }
}
