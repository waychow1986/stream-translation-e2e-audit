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
  private timer: number | null = null;
  private lastSubmittedAt = 0;

  constructor(submit: (text: string) => void, clock: Clock = systemClock) {
    this.submit = submit;
    this.clock = clock;
  }

  update(text: string): void {
    if (!text || text.length > 4000) {
      this.dispose();
      return;
    }
    this.latest = text;
    if (this.clock.now() - this.lastSubmittedAt >= 2000) {
      this.flush();
      return;
    }
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    if (!this.latest) return;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.lastSubmittedAt = this.clock.now();
    this.submit(this.latest);
  }

  dispose(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.latest = "";
  }
}
