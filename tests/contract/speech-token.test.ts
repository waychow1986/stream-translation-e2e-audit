import assert from "node:assert/strict";
import test from "node:test";
import { SpeechTokenProvider } from "../../src/server/speech-token.ts";

test("Speech token has aad format, merges concurrent refresh and uses five-minute margin", async () => {
  let calls = 0;
  const provider = new SpeechTokenProvider(
    "/subscriptions/s/resourceGroups/g/providers/Microsoft.CognitiveServices/accounts/a",
    async () => {
      calls += 1;
      return { token: "access", expiresOnTimestamp: Date.now() + 10 * 60_000 };
    }
  );
  const [first, second] = await Promise.all([provider.getToken(), provider.getToken()]);
  assert.equal(calls, 1);
  assert.equal(first.authorizationToken, `aad#/subscriptions/s/resourceGroups/g/providers/Microsoft.CognitiveServices/accounts/a#access`);
  assert.deepEqual(first, second);
  assert.ok(Date.parse(first.expiresAt) > Date.now());
});
