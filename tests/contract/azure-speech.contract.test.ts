import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AzureSpeechAdapter,
  buildSpeechAuthorizationToken,
  isSupportedEnglish,
  nextRefreshDelay,
  type SpeechSdkFacade
} from "../../src/server/adapters/azure-speech.js";
import type { AppConfig } from "../../src/server/config.js";
import { TranslationSession } from "../../src/server/translation-session.js";

describe("Azure Speech contract", () => {
  afterEach(() => vi.useRealTimers());

  it("constructs complete Entra authorization and accepts English only", () => {
    expect(buildSpeechAuthorizationToken("/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a", "token"))
      .toBe("aad#/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a#token");
    expect(isSupportedEnglish("en-US")).toBe(true);
    expect(isSupportedEnglish("zh-CN")).toBe(false);
  });

  it("refreshes before expiry and rejects malformed resource IDs", () => {
    expect(nextRefreshDelay(1_000_000, 100_000)).toBe(600_000);
    expect(() => buildSpeechAuthorizationToken("bad", "token")).toThrow();
  });

  it("configures continuous identification, refreshes the active recognizer, and cancels without exposing authorization", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const calls: string[] = [];
    const authorizations: string[] = [];
    let canceled: (() => void) | undefined;
    const recognizer = {
      set authorizationToken(value: string) { authorizations.push(`recognizer:${value}`); },
      recognized: undefined,
      set canceled(handler: () => void) { canceled = handler; },
      startContinuousRecognitionAsync(resolve: () => void) { calls.push("recognizer.start"); resolve(); },
      stopContinuousRecognitionAsync(resolve: () => void) { calls.push("recognizer.stop"); resolve(); },
      close() { calls.push("recognizer.close"); }
    };
    const speechConfig = {
      set authorizationToken(value: string) { authorizations.push(`config:${value}`); },
      setProperty: vi.fn((property: unknown, value: string) => calls.push(`language-id:${String(property)}:${value}`))
    };
    const stream = {
      write: vi.fn(),
      close: vi.fn(() => calls.push("stream.close"))
    };
    const sdk: SpeechSdkFacade = {
      propertyIdLanguageIdMode: "language-id-mode",
      recognizedSpeechReason: "recognized",
      createSpeechConfig: vi.fn(() => speechConfig),
      createAutoDetectSourceLanguageConfig: vi.fn((languages) => {
        calls.push(`languages:${languages.join(",")}`);
        return {};
      }),
      createPcmFormat: vi.fn(() => ({})),
      createPushStream: vi.fn(() => stream),
      createAudioConfig: vi.fn(() => ({})),
      createRecognizer: vi.fn(() => recognizer),
      languageFromResult: vi.fn(() => "en-US")
    };
    const credential = {
      getToken: vi.fn()
        .mockResolvedValueOnce({ token: "value-one", expiresOnTimestamp: 1_000_000 })
        .mockResolvedValueOnce({ token: "value-two", expiresOnTimestamp: 2_000_000 })
    };
    const events: unknown[] = [];
    const adapter = new AzureSpeechAdapter(config(), { credential, sdk });
    const session = new TranslationSession({
      speech: adapter,
      translator: { async translate() { return { requestId: "unused" }; } }
    }, (event) => events.push(event));

    await session.start();
    expect(calls).toContain("languages:en-US,zh-CN");
    expect(calls).toContain("language-id:language-id-mode:Continuous");
    expect(authorizations).toEqual([
      `config:${buildSpeechAuthorizationToken(config().speechResourceId, "value-one")}`,
      `recognizer:${buildSpeechAuthorizationToken(config().speechResourceId, "value-one")}`
    ]);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(authorizations.slice(-2)).toEqual([
      `config:${buildSpeechAuthorizationToken(config().speechResourceId, "value-two")}`,
      `recognizer:${buildSpeechAuthorizationToken(config().speechResourceId, "value-two")}`
    ]);

    canceled?.();
    await vi.waitFor(() => expect(events).toContainEqual({
      type: "session.failed",
      code: "SPEECH_UNAVAILABLE"
    }));
    await session.fail("INTERNAL_ERROR");
    expect(stream.close).toHaveBeenCalledOnce();
    expect(calls.filter((call) => call === "recognizer.stop")).toHaveLength(1);
    expect(calls.filter((call) => call === "recognizer.close")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain("value-one");
    expect(JSON.stringify(events)).not.toContain("value-two");
  });

  it("maps initial SDK authorization failure to a stable Speech error", async () => {
    const events: unknown[] = [];
    const adapter = new AzureSpeechAdapter(config(), {
      credential: { getToken: vi.fn().mockRejectedValue(new Error("credential unavailable")) }
    });
    const session = new TranslationSession({
      speech: adapter,
      translator: { async translate() { return { requestId: "unused" }; } }
    }, (event) => events.push(event));

    await session.start();
    expect(events).toEqual([{ type: "session.failed", code: "SPEECH_UNAVAILABLE" }]);
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
    modelDeployment: "deployment",
    adapterMode: "azure"
  };
}
