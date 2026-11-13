import assert from "node:assert/strict";
import test from "node:test";
import { parseTranslationRequest } from "../../src/shared/schemas.ts";

test("translation schema accepts English and rejects unknown fields and limits", () => {
  assert.equal(parseTranslationRequest({ segmentId: "1", revision: 1, mode: "draft", sourceLanguage: "en-US", text: "hello" }).text, "hello");
  assert.throws(() => parseTranslationRequest({ segmentId: "1", revision: 1, mode: "draft", sourceLanguage: "zh-CN", text: "你好" }));
  assert.throws(() => parseTranslationRequest({ segmentId: "1", revision: 1, mode: "draft", sourceLanguage: "en-US", text: "x".repeat(4001) }));
  assert.throws(() => parseTranslationRequest({ segmentId: "1", revision: 1, mode: "draft", sourceLanguage: "en-US", text: "hello", extra: true }));
});
