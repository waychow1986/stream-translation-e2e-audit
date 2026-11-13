import { randomUUID } from "node:crypto";
import type { FailureCode, RecognitionSegment, ServerEvent, SessionState } from "../shared/types.js";
import type { TranslationAdapter } from "./adapters/foundry.js";
import type { SpeechAdapter } from "./adapters/speech.js";
import { TranslationQueue } from "./translation-queue.js";

export class SessionLifecycle {
  state: SessionState = "idle";

  start(): void { this.transition("idle", "starting"); }
  started(): void { this.transition("starting", "listening"); }
  stop(): void { this.transition("listening", "draining"); }
  stopped(): void { this.transition("draining", "stopped"); }
  fail(): void {
    if (this.state === "stopped" || this.state === "failed") return;
    this.state = "failed";
  }
  acceptAudio(): boolean { return this.state === "listening"; }
  canEmitBusinessEvent(): boolean { return !["stopped", "failed"].includes(this.state); }
  private transition(expected: SessionState, next: SessionState): void {
    if (this.state !== expected) throw new Error(`Invalid session transition ${this.state} -> ${next}`);
    this.state = next;
  }
}

export interface SessionAdapters {
  speech: SpeechAdapter;
  translator: TranslationAdapter;
}

export class TranslationSession {
  readonly lifecycle = new SessionLifecycle();
  private readonly abortController = new AbortController();
  private readonly queue: TranslationQueue;
  private closed = false;

  constructor(
    private readonly adapters: SessionAdapters,
    private readonly emit: (event: ServerEvent) => void
  ) {
    this.queue = new TranslationQueue((segment) => this.translate(segment));
  }

  async start(): Promise<void> {
    this.lifecycle.start();
    await this.adapters.speech.start(
      (segment) => this.acceptSegment(segment),
      () => void this.fail("SPEECH_UNAVAILABLE")
    );
    this.lifecycle.started();
    this.emit({ type: "session.started", protocolVersion: 1, sessionId: randomUUID() });
  }

  pushAudio(frame: Buffer): void {
    if (!this.lifecycle.acceptAudio()) throw new Error("Audio is not accepted");
    if (frame.length === 0 || frame.length % 2 !== 0) throw new Error("Invalid PCM frame");
    this.adapters.speech.push(frame);
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.lifecycle.stop();
    await this.adapters.speech.stop();
    await this.queue.drain();
    if (this.lifecycle.state === "failed") return;
    this.lifecycle.stopped();
    this.closed = true;
    this.emit({ type: "session.stopped" });
  }

  async fail(code: FailureCode = "INTERNAL_ERROR"): Promise<void> {
    if (this.closed) return;
    this.lifecycle.fail();
    this.closed = true;
    this.abortController.abort();
    await this.adapters.speech.cancel();
    this.emit({ type: "session.failed", code });
  }

  private acceptSegment(segment: RecognitionSegment): void {
    if (!this.lifecycle.canEmitBusinessEvent()) return;
    this.emit({ type: "speech.final", segmentId: segment.segmentId, detectedLanguage: segment.detectedLanguage });
    if (segment.detectedLanguage.toLowerCase().split("-")[0] !== "en") return;
    this.queue.enqueue(segment);
  }

  private async translate(segment: RecognitionSegment): Promise<void> {
    try {
      const result = await this.adapters.translator.translate(segment.text, this.abortController.signal);
      let revision = 0;
      let text = "";
      for (const delta of result.deltas) {
        text += delta;
        this.emit({
          type: "subtitle.delta",
          segmentId: segment.segmentId,
          revision: ++revision,
          textDelta: delta,
          targetLanguage: "zh-CN"
        });
      }
      this.emit({
        type: "subtitle.final",
        segmentId: segment.segmentId,
        revision: ++revision,
        text,
        targetLanguage: "zh-CN"
      });
      this.emit({
        type: "dependency.evidence",
        segmentId: segment.segmentId,
        speechResultId: segment.speechResultId,
        modelRequestId: result.requestId
      });
    } catch {
      await this.fail("MODEL_UNAVAILABLE");
    }
  }
}
