import activeWin from "active-win";
import type { Vrm } from "@hmcs/sdk";
import type { TtsChunkQueue } from "./tts-chunk-queue.js";

export interface ReactionConfig {
  click_phrases: string[];
  idle_phrases: string[];
  /** May contain `{title}` placeholder replaced with active window title. */
  window_phrases: string[];
  idle_timeout_ms: number;
  window_check_interval_ms: number;
}

interface TtsSpeakResponse {
  audio_base64: string;
}

export class ReactionController {
  private readonly vrm: Vrm;
  private readonly ttsQueue: TtsChunkQueue;
  private readonly restUrl: string;
  private readonly config: ReactionConfig;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private windowInterval: ReturnType<typeof setInterval> | null = null;
  private lastWindowTitle: string | null = null;

  constructor(vrm: Vrm, ttsQueue: TtsChunkQueue, restUrl: string, config: ReactionConfig) {
    this.vrm = vrm;
    this.ttsQueue = ttsQueue;
    this.restUrl = restUrl;
    this.config = config;
  }

  start(): void {
    this.scheduleIdleTimer();
    this.startWindowWatcher();
  }

  stop(): void {
    this.cancelIdleTimer();
    if (this.windowInterval !== null) {
      clearInterval(this.windowInterval);
      this.windowInterval = null;
    }
    this.lastWindowTitle = null;
  }

  async onPrimaryClick(): Promise<void> {
    this.scheduleIdleTimer();
    if (this.ttsQueue.isBusy()) return;
    const phrase = pickRandom(this.config.click_phrases);
    if (phrase === null) return;
    await this.speak(phrase);
  }

  private scheduleIdleTimer(): void {
    this.cancelIdleTimer();
    this.idleTimer = setTimeout(() => this.handleIdle(), this.config.idle_timeout_ms);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async handleIdle(): Promise<void> {
    this.scheduleIdleTimer();
    if (this.ttsQueue.isBusy()) return;
    const phrase = pickRandom(this.config.idle_phrases);
    if (phrase === null) return;
    await this.speak(phrase);
  }

  private startWindowWatcher(): void {
    if (this.windowInterval !== null) {
      clearInterval(this.windowInterval);
    }
    this.windowInterval = setInterval(
      () => this.checkActiveWindow().catch(() => {}),
      this.config.window_check_interval_ms,
    );
  }

  private async checkActiveWindow(): Promise<void> {
    const info = await activeWin();
    const title = info?.title ?? null;

    if (title === null) return;

    if (this.lastWindowTitle === null) {
      // First observation: record but do not fire
      this.lastWindowTitle = title;
      return;
    }

    if (title === this.lastWindowTitle) return;

    this.lastWindowTitle = title;

    if (this.ttsQueue.isBusy()) return;

    const template = pickRandom(this.config.window_phrases);
    if (template === null) return;
    const phrase = template.replace("{title}", title);
    await this.speak(phrase);
  }

  private async speak(text: string): Promise<void> {
    try {
      const response = await fetch(`${this.restUrl}/v1/tts/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return;
      const { audio_base64 } = (await response.json()) as TtsSpeakResponse;
      const audioBytes = Buffer.from(audio_base64, "base64");
      await this.vrm.speakWithTimeline(audioBytes, [], { waitForCompletion: true });
    } catch {
      // Ignore errors — reactions are best-effort
    }
  }
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}
