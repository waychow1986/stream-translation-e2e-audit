export type SourceLanguage = "en-US" | "zh-CN";

export interface CaptionSegment {
  readonly id: string;
  readonly language: SourceLanguage;
  readonly sourceText: string;
  readonly displayText: string;
  readonly status: "draft" | "finalizing" | "fixed";
  readonly revision: number;
  readonly requestId: string | null;
}

export interface CaptionState {
  readonly fixedSegments: readonly CaptionSegment[];
  readonly current: CaptionSegment | null;
}

export interface TranslationRequest {
  segmentId: string;
  revision: number;
  mode: "draft" | "final";
  sourceLanguage: "en-US";
  text: string;
}

export type TranslationEvent =
  | { type: "delta"; text: string }
  | { type: "completed"; text: string }
  | { type: "error"; code: "DEPENDENCY_FAILED" | "RATE_LIMITED" | "CANCELLED" };
