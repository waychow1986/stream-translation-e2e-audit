import type { CaptionSegment, CaptionState, SourceLanguage } from "../shared/contracts.ts";

export const initialCaptionState: CaptionState = Object.freeze({ fixedSegments: Object.freeze([]), current: null });

export type CaptionAction =
  | { type: "recognizing"; segmentId: string; language: SourceLanguage; sourceText: string; revision: number }
  | { type: "recognizedChinese"; segmentId: string; sourceText: string; revision: number }
  | { type: "translationStarted"; segmentId: string; revision: number; requestId: string; final: boolean; sourceText: string }
  | { type: "translationDelta"; segmentId: string; revision: number; requestId: string; text: string; first: boolean }
  | { type: "translationCompleted"; segmentId: string; revision: number; requestId: string }
  | { type: "clearCurrent" };

function matches(current: CaptionSegment | null, action: { segmentId: string; revision: number; requestId: string }): current is CaptionSegment {
  return Boolean(
    current &&
      current.id === action.segmentId &&
      current.revision === action.revision &&
      (current.requestId === action.requestId || current.requestId === null)
  );
}

export function captionReducer(state: CaptionState, action: CaptionAction): CaptionState {
  switch (action.type) {
    case "recognizing": {
      if (state.current && state.current.id !== action.segmentId) return state;
      const previous = state.current;
      return {
        ...state,
        current: {
          id: action.segmentId,
          language: action.language,
          sourceText: action.sourceText,
          displayText: action.language === "zh-CN" ? action.sourceText : previous?.displayText ?? "",
          status: "draft",
          revision: action.revision,
          requestId: null
        }
      };
    }
    case "recognizedChinese": {
      if (!state.current || state.current.id !== action.segmentId || state.current.language !== "zh-CN") return state;
      const fixed = Object.freeze({
        ...state.current,
        sourceText: action.sourceText,
        displayText: action.sourceText,
        revision: action.revision,
        status: "fixed" as const,
        requestId: null
      });
      return { fixedSegments: Object.freeze([...state.fixedSegments, fixed]), current: null };
    }
    case "translationStarted": {
      if (!state.current || state.current.id !== action.segmentId || action.revision < state.current.revision) return state;
      return {
        ...state,
        current: {
          ...state.current,
          sourceText: action.sourceText,
          revision: action.revision,
          requestId: action.requestId,
          status: action.final ? "finalizing" : "draft"
        }
      };
    }
    case "translationDelta": {
      if (!matches(state.current, action)) return state;
      return {
        ...state,
        current: {
          ...state.current,
          requestId: action.requestId,
          displayText: action.first ? action.text : state.current.displayText + action.text
        }
      };
    }
    case "translationCompleted": {
      if (!matches(state.current, action) || state.current.status !== "finalizing") return state;
      const fixed = Object.freeze({ ...state.current, status: "fixed" as const, requestId: null });
      return { fixedSegments: Object.freeze([...state.fixedSegments, fixed]), current: null };
    }
    case "clearCurrent":
      return { ...state, current: null };
  }
}
