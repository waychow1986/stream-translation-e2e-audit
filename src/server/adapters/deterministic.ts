import type { RecognitionSegment } from "../../shared/types.js";
import type { SessionAdapters } from "../translation-session.js";
import { FoundryTranslator } from "./foundry.js";
import type { SpeechAdapter } from "./speech.js";

const testSegments = [
  { english: "Welcome to the meeting.", chinese: ["欢迎", "参加本次会议。"] },
  { english: "We will discuss the project.", chinese: ["我们将", "讨论这个项目。"] }
];

export class RecordingSpeechAdapter implements SpeechAdapter {
  audio = Buffer.alloc(0);
  segments: RecognitionSegment[] = [];
  cancelled = false;
  private onSegment?: (segment: RecognitionSegment) => void;
  private emitted = 0;
  private frames = 0;

  async start(onSegment?: (segment: RecognitionSegment) => void): Promise<void> {
    this.onSegment = onSegment;
  }

  push(frame: Buffer): void {
    if (this.cancelled) throw new Error("Adapter cancelled");
    this.audio = Buffer.concat([this.audio, frame]);
    this.frames++;
    const shouldEmit = frame.length < 640
      || this.emitted === 0
      || (this.emitted === 1 && this.frames >= 106);
    if (frame.length >= 320 && shouldEmit && this.emitted < testSegments.length) {
      const source = testSegments[this.emitted]!;
      const detectedLanguage = frame[0] === 9 ? "zh-CN" : "en-US";
      const segment = {
        segmentId: ++this.emitted,
        detectedLanguage,
        text: source.english,
        isFinal: true as const,
        speechResultId: `test-double:speech-${this.emitted}`
      };
      this.segments.push(segment);
      this.onSegment?.(segment);
    }
  }

  async stop(): Promise<void> {}

  async cancel(): Promise<void> {
    this.cancelled = true;
  }
}

export function deterministicAdapters(): SessionAdapters {
  const speech = new RecordingSpeechAdapter();
  const translator = new FoundryTranslator(async ({ input }, onDelta) => {
    const index = testSegments.findIndex((segment) => segment.english === input);
    const deltas = testSegments[Math.max(0, index)]!.chinese;
    for (const delta of deltas) onDelta(delta);
    return {
      requestId: `test-double:model-${index + 1}`
    };
  });
  return { speech, translator };
}
