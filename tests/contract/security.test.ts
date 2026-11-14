import assert from "node:assert/strict";
import test from "node:test";
import { redactLogValue } from "../../src/server/logger.ts";
import { contentSecurityPolicy, isSameOrigin } from "../../src/server/security.ts";

test("same-origin checks and redaction protect content and tokens", () => {
  assert.equal(isSameOrigin("https://app.example", "app.example"), true);
  assert.equal(isSameOrigin("https://evil.example", "app.example"), false);
  const output = JSON.stringify(redactLogValue({ authorizationToken: "secret", text: "meeting words", errorCode: "FAILED" }));
  assert.doesNotMatch(output, /secret|meeting words/);
  assert.match(output, /FAILED/);
});

test("CSP permits only the configured Speech endpoint and Azure Speech regional STT websockets", () => {
  const policy = contentSecurityPolicy("https://speech-resource.cognitiveservices.azure.com");

  assert.match(policy, /connect-src 'self' https:\/\/speech-resource\.cognitiveservices\.azure\.com/);
  assert.match(policy, /wss:\/\/speech-resource\.cognitiveservices\.azure\.com/);
  assert.match(policy, /wss:\/\/\*\.stt\.speech\.microsoft\.com/);
  assert.doesNotMatch(policy, /(?:^| )wss:(?: |;|$)/);
  assert.doesNotMatch(policy, /wss:\/\/\*\.speech\.microsoft\.com/);
});
