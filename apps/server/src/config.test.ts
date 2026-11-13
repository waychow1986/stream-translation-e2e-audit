import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const validEnvironment = {
  PORT: "8080",
  PUBLIC_ORIGIN: "https://translation.example",
  SPEECH_REGION: "eastus",
  SPEECH_KEY: "test-only-placeholder",
  SPEECH_SOURCE_LANGUAGES_JSON:
    '[{"tag":"en-US","displayNameZh":"英语（美国）","enabled":true}]',
  SPEECH_CATALOG_VERSION: "catalog-1",
  AZURE_FOUNDRY_ENDPOINT: "https://foundry.example",
  AZURE_FOUNDRY_DEPLOYMENT: "gpt-sol-6.1",
};

describe("startup configuration", () => {
  it("loads the approved configuration without exposing secrets", () => {
    const result = loadConfig(validEnvironment);

    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.config.port).toBe(8080);
      expect(result.config.publicOrigin).toBe(
        "https://translation.example",
      );
      expect(result.config.speechKey).toBe("test-only-placeholder");
    }
    expect(JSON.stringify(result)).not.toContain("SPEECH_KEY=");
  });

  it.each([
    ["missing required configuration", { ...validEnvironment, PORT: undefined }],
    ["invalid port", { ...validEnvironment, PORT: "70000" }],
    [
      "non-HTTPS production origin",
      { ...validEnvironment, PUBLIC_ORIGIN: "http://translation.example" },
    ],
    [
      "invalid language catalog JSON",
      { ...validEnvironment, SPEECH_SOURCE_LANGUAGES_JSON: "not-json" },
    ],
    [
      "wrong Foundry deployment",
      { ...validEnvironment, AZURE_FOUNDRY_DEPLOYMENT: "other-model" },
    ],
  ])("reports %s as not ready", (_description, environment) => {
    const result = loadConfig(environment);

    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.issues)).not.toContain(
        "test-only-placeholder",
      );
    }
  });

  it("permits loopback HTTP for local developer validation", () => {
    const result = loadConfig({
      ...validEnvironment,
      PUBLIC_ORIGIN: "http://127.0.0.1:8080",
    });

    expect(result.ready).toBe(true);
  });
});
