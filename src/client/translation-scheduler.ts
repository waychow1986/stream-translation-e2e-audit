interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}

const systemClock: Clock = {
  now: Date.now,
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer)
};

export class TranslationScheduler {
  private readonly submit: (text: string) => void;
  private readonly clock: Clock;
  private latest = "";
  private lastSubmitted = "";
  private stableSnapshot = "";
  private silenceTimer: number | null = null;
  private continuousTimer: number | null = null;

  constructor(submit: (text: string) => void, clock: Clock = systemClock) {
    this.submit = submit;
    this.clock = clock;
  }

  update(text: string): void {
    if (!text || text.length > 4000) {
      this.dispose();
      return;
    }
    if (text === this.latest) return;
    this.latest = text;
    if (this.continuousTimer === null) {
      this.continuousTimer = this.clock.setTimeout(() => this.flush(this.latest), 2000);
    }
    const stableSnapshot = completeTokenSnapshot(text);
    if (!stableSnapshot || stableSnapshot === this.lastSubmitted || stableSnapshot === this.stableSnapshot) return;
    this.stableSnapshot = stableSnapshot;
    if (this.silenceTimer !== null) this.clock.clearTimeout(this.silenceTimer);
    this.silenceTimer = this.clock.setTimeout(() => this.flush(this.stableSnapshot), 400);
  }

  flush(snapshot = this.stableSnapshot || this.latest): void {
    if (!snapshot || snapshot === this.lastSubmitted) return;
    this.clearTimers();
    this.lastSubmitted = snapshot;
    this.stableSnapshot = "";
    this.submit(snapshot);
  }

  dispose(): void {
    this.clearTimers();
    this.latest = "";
    this.stableSnapshot = "";
  }

  private clearTimers(): void {
    if (this.silenceTimer !== null) this.clock.clearTimeout(this.silenceTimer);
    if (this.continuousTimer !== null) this.clock.clearTimeout(this.continuousTimer);
    this.silenceTimer = null;
    this.continuousTimer = null;
  }
}

function completeTokenSnapshot(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/[\s.!?,;:。！？；：]$/u.test(text)) return trimmed;
  const lastBoundary = Math.max(trimmed.lastIndexOf(" "), trimmed.lastIndexOf("\t"), trimmed.lastIndexOf("\n"));
  return lastBoundary < 0 ? "" : trimmed.slice(0, lastBoundary).trim();
}
