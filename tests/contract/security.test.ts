import assert from "node:assert/strict";
import test from "node:test";
import { redactLogValue } from "../../src/server/logger.ts";
import { isSameOrigin } from "../../src/server/security.ts";

test("same-origin checks and redaction protect content and tokens", () => {
  assert.equal(isSameOrigin("https://app.example", "app.example"), true);
  assert.equal(isSameOrigin("https://evil.example", "app.example"), false);
  const output = JSON.stringify(redactLogValue({ authorizationToken: "secret", text: "meeting words", errorCode: "FAILED" }));
  assert.doesNotMatch(output, /secret|meeting words/);
  assert.match(output, /FAILED/);
});
