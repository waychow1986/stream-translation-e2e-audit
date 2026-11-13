import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";

const valid = {
  NODE_ENV: "production",
  PORT: "3000",
  AIDELIVERY_DELIVERY_ID: "delivery",
  AIDELIVERY_CANDIDATE_SHA: "sha",
  AZURE_CLIENT_ID: "client",
  AZURE_SPEECH_ENDPOINT: "https://speech.example.com",
  AZURE_SPEECH_RESOURCE_ID: "/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a",
  AZURE_AI_PROJECT_ENDPOINT: "https://project.example.com",
  AZURE_AI_MODEL_DEPLOYMENT_NAME: "gpt-sol-6.1"
};

describe("configuration and HTTP contracts", () => {
  afterEach(() => delete process.env.APP_ADAPTER_MODE);

  it("validates Azure identifiers and conflicting Foundry endpoints", () => {
    expect(() => loadConfig(valid)).not.toThrow();
    expect(() => loadConfig({ ...valid, AZURE_SPEECH_RESOURCE_ID: "accounts/a" })).toThrow();
    expect(() => loadConfig({
      ...valid,
      FOUNDRY_PROJECT_ENDPOINT: "https://other.example.com"
    })).toThrow();
    expect(() => loadConfig({ ...valid, APP_ADAPTER_MODE: "deterministic" })).toThrow();
  });

  it("returns readiness and exact candidate identity", async () => {
    const app = await buildApp(loadConfig(valid), { registerWebSocket: false });
    expect((await app.inject("/healthz")).json()).toEqual({ status: "ok" });
    expect((await app.inject("/candidate-identity")).json()).toEqual({
      deliveryId: "delivery",
      candidateSha: "sha"
    });
    await app.close();
  });
});
