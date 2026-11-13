export type SessionState = "idle" | "starting" | "listening" | "draining" | "stopped" | "failed";

export interface RecognitionSegment {
  segmentId: number;
  detectedLanguage: string;
  text: string;
  isFinal: true;
  speechResultId: string;
}

export interface SubtitleSegment {
  segmentId: number;
  revision: number;
  text: string;
  isFinal: boolean;
}

export type FailureCode =
  | "INVALID_AUDIO"
  | "UNSUPPORTED_LANGUAGE"
  | "SPEECH_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "PROTOCOL_ERROR"
  | "INTERNAL_ERROR";

export type ServerEvent =
  | { type: "session.started"; protocolVersion: 1; sessionId: string }
  | { type: "speech.final"; segmentId: number; detectedLanguage: string }
  | { type: "subtitle.delta"; segmentId: number; revision: number; textDelta: string; targetLanguage: "zh-CN" }
  | { type: "subtitle.final"; segmentId: number; revision: number; text: string; targetLanguage: "zh-CN" }
  | { type: "dependency.evidence"; segmentId: number; speechResultId: string; modelRequestId: string }
  | { type: "session.stopped" }
  | { type: "session.failed"; code: FailureCode };

export interface TranslationResult {
  requestId: string;
  deltas: string[];
}
