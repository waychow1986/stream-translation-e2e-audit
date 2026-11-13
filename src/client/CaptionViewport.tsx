import { useLayoutEffect, useRef } from "react";
import type { CaptionState } from "../shared/contracts.ts";

export function CaptionViewport({ state }: { state: CaptionState }) {
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [state.fixedSegments.length, state.current?.displayText]);
  return (
    <div className="caption-viewport" data-testid="caption-viewport" ref={viewport} aria-live="polite">
      {state.fixedSegments.map((segment) => (
        <p data-caption-state="fixed" data-segment-id={segment.id} key={segment.id}>
          {segment.displayText}
        </p>
      ))}
      {state.current && (
        <p data-caption-state={state.current.status} data-segment-id={state.current.id}>
          {state.current.displayText}
        </p>
      )}
    </div>
  );
}
