import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../src/server/app.ts";
import { loadConfig } from "../../src/server/config.ts";

const env = {
  PORT: "8080",
  AIDELIVERY_DELIVERY_ID: "delivery-test",
  AIDELIVERY_CANDIDATE_SHA: "abc123",
  AZURE_CLIENT_ID: "client",
  AZURE_SPEECH_ENDPOINT: "https://speech.example.com",
  AZURE_SPEECH_RESOURCE_ID: "/subscriptions/s/resourceGroups/g/providers/Microsoft.CognitiveServices/accounts/a",
  AZURE_AI_PROJECT_ENDPOINT: "https://ai.example.com",
  AZURE_AI_MODEL_DEPLOYMENT_NAME: "gpt-sol-6.1"
};

test("configuration fails fast and platform endpoints are isolated", async () => {
  assert.throws(() => loadConfig({}), /PORT/);
  const app = await buildApp({ config: loadConfig(env), tokenProvider: null, translator: null });
  const health = await app.inject({ method: "GET", url: "/healthz" });
  assert.deepEqual(health.json(), { status: "ok" });
  const identity = await app.inject({ method: "GET", url: "/candidate-identity" });
  assert.deepEqual(identity.json(), { deliveryId: "delivery-test", candidateSha: "abc123" });
  await app.close();
});
