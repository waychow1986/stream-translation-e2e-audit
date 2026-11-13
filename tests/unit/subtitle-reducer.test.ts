import { describe, expect, it } from "vitest";
import { subtitleReducer } from "../../src/client/subtitle-reducer.js";

describe("subtitle reducer", () => {
  it("keeps segment order, monotonic revisions and immutable final text", () => {
    let state = subtitleReducer([], { type: "subtitle.delta", segmentId: 2, revision: 1, textDelta: "二", targetLanguage: "zh-CN" });
    state = subtitleReducer(state, { type: "subtitle.final", segmentId: 1, revision: 1, text: "一", targetLanguage: "zh-CN" });
    state = subtitleReducer(state, { type: "subtitle.final", segmentId: 1, revision: 2, text: "覆盖", targetLanguage: "zh-CN" });
    expect(state.map((item) => item.text)).toEqual(["一", "二"]);
  });
});
