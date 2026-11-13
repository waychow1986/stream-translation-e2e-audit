import assert from "node:assert/strict";
import test from "node:test";
import { captionReducer, initialCaptionState } from "../../src/client/caption-reducer.ts";

test("Chinese interim is shown verbatim and final is fixed", () => {
  let state = captionReducer(initialCaptionState, { type: "recognizing", segmentId: "1", language: "zh-CN", sourceText: "你", revision: 1 });
  assert.equal(state.current?.displayText, "你");
  state = captionReducer(state, { type: "recognizedChinese", segmentId: "1", sourceText: "你好", revision: 2 });
  assert.equal(state.fixedSegments[0]?.displayText, "你好");
  assert.equal(state.fixedSegments[0]?.sourceText, "你好");
});
