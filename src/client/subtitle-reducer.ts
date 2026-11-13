import type { ServerEvent, SubtitleSegment } from "../shared/types.js";

type SubtitleEvent = Extract<ServerEvent, { type: "subtitle.delta" | "subtitle.final" }>;

export function subtitleReducer(state: SubtitleSegment[], event: SubtitleEvent): SubtitleSegment[] {
  const current = state.find((item) => item.segmentId === event.segmentId);
  if (current?.isFinal || (current && event.revision <= current.revision)) return state;
  const text = event.type === "subtitle.delta"
    ? `${current?.text ?? ""}${event.textDelta}`
    : event.text;
  const next: SubtitleSegment = {
    segmentId: event.segmentId,
    revision: event.revision,
    text,
    isFinal: event.type === "subtitle.final"
  };
  return [...state.filter((item) => item.segmentId !== event.segmentId), next]
    .sort((left, right) => left.segmentId - right.segmentId);
}
