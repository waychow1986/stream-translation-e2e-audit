import assert from "node:assert/strict";
import test from "node:test";
import { captionReducer, initialCaptionState } from "../../src/client/caption-reducer.ts";

test("fixed captions append in order with at most one current tail", () => {
  let state = initialCaptionState;
  for (const [index, text] of ["一", "二"].entries()) {
    const id = String(index);
    state = captionReducer(state, { type: "recognizing", segmentId: id, language: "zh-CN", sourceText: text, revision: 1 });
    state = captionReducer(state, { type: "recognizedChinese", segmentId: id, sourceText: text, revision: 2 });
  }
  assert.deepEqual(state.fixedSegments.map((item) => item.displayText), ["一", "二"]);
  assert.equal(state.current, null);
});
