import assert from "node:assert/strict";
import test from "node:test";
import { captionReducer, initialCaptionState } from "../../src/client/caption-reducer.ts";

test("failure clears current while retaining fixed captions", () => {
  let state = captionReducer(initialCaptionState, { type: "recognizing", segmentId: "1", language: "zh-CN", sourceText: "固定", revision: 1 });
  state = captionReducer(state, { type: "recognizedChinese", segmentId: "1", sourceText: "固定", revision: 2 });
  state = captionReducer(state, { type: "recognizing", segmentId: "2", language: "en-US", sourceText: "draft", revision: 1 });
  state = captionReducer(state, { type: "clearCurrent" });
  assert.equal(state.current, null);
  assert.equal(state.fixedSegments[0]?.displayText, "固定");
});
