import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/server/config.js";

const mocks = vi.hoisted(() => ({
  getAzureOpenAIClient: vi.fn(),
  createCompletion: vi.fn()
}));

vi.mock("@azure/ai-projects", () => ({
  AIProjectClient: class {
    getAzureOpenAIClient = mocks.getAzureOpenAIClient;
  }
}));

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {}
}));

import { createAzureFoundryTranslator } from "../../src/server/adapters/azure-foundry.js";

describe("Azure Foundry adapter contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCompletion.mockReturnValue({
      withResponse: async () => ({
        data: (async function* () {
          yield { choices: [{ delta: { content: "你好" } }] };
        })(),
        request_id: "request-1"
      })
    });
    mocks.getAzureOpenAIClient.mockResolvedValue({
      chat: { completions: { create: mocks.createCompletion } }
    });
  });

  it("creates the OpenAI client with the approved API version", async () => {
    const translator = createAzureFoundryTranslator(config());

    await translator.translate("hello", new AbortController().signal, vi.fn());

    expect(mocks.getAzureOpenAIClient).toHaveBeenCalledWith({
      apiVersion: "2025-04-01-preview"
    });
  });
});

function config(): AppConfig {
  return {
    nodeEnv: "test",
    port: 3000,
    deliveryId: "delivery",
    candidateSha: "candidate",
    azureClientId: "client",
    speechEndpoint: "https://speech.example.test",
    speechResourceId: "/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a",
    foundryProjectEndpoint: "https://foundry.example.test",
    modelDeployment: "model",
    adapterMode: "azure"
  };
}
