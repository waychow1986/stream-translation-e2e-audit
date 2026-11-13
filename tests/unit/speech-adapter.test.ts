import assert from "node:assert/strict";
import test from "node:test";
import { candidateLanguages, tokenRefreshDelay } from "../../src/client/speech-adapter.ts";

test("Speech adapter fixes bilingual candidates and refreshes two minutes early", () => {
  assert.deepEqual(candidateLanguages, ["en-US", "zh-CN"]);
  assert.equal(tokenRefreshDelay(Date.now() + 10 * 60_000, Date.now()), 8 * 60_000);
});
