import assert from "node:assert/strict";
import test from "node:test";
import { captionReducer, initialCaptionState } from "../../src/client/caption-reducer.ts";

test("English draft revisions reject stale events and final becomes immutable", () => {
  let state = captionReducer(initialCaptionState, { type: "recognizing", segmentId: "1", language: "en-US", sourceText: "hello", revision: 1 });
  state = captionReducer(state, { type: "translationDelta", segmentId: "1", revision: 1, requestId: "a", text: "你", first: true });
  state = captionReducer(state, { type: "translationStarted", segmentId: "1", revision: 2, requestId: "b", final: true, sourceText: "hello world" });
  state = captionReducer(state, { type: "translationDelta", segmentId: "1", revision: 1, requestId: "a", text: "过期", first: true });
  assert.notEqual(state.current?.displayText, "过期");
  state = captionReducer(state, { type: "translationDelta", segmentId: "1", revision: 2, requestId: "b", text: "你好世界", first: true });
  state = captionReducer(state, { type: "translationCompleted", segmentId: "1", revision: 2, requestId: "b" });
  assert.equal(state.fixedSegments[0]?.displayText, "你好世界");
  const fixed = state.fixedSegments[0];
  state = captionReducer(state, { type: "translationDelta", segmentId: "1", revision: 2, requestId: "b", text: "改写", first: true });
  assert.equal(state.fixedSegments[0], fixed);
});
