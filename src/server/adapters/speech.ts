import type { RecognitionSegment } from "../../shared/types.js";

export interface SpeechAdapter {
  start(onSegment?: (segment: RecognitionSegment) => void, onError?: () => void): Promise<void>;
  push(frame: Buffer): void;
  stop(): Promise<void>;
  cancel(): Promise<void>;
}
