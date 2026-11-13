import assert from "node:assert/strict";
import test from "node:test";
import { candidateLanguages, createSpeechSession, tokenRefreshDelay, type SpeechSdkFacade } from "../../src/client/speech-adapter.ts";
import type { SpeechRecognition } from "../../src/client/speech-types.ts";

test("Speech adapter fixes bilingual candidates and refreshes two minutes early", () => {
  assert.deepEqual(candidateLanguages, ["en-US", "zh-CN"]);
  assert.equal(tokenRefreshDelay(Date.now() + 10 * 60_000, Date.now()), 8 * 60_000);
});

test("Speech adapter dispatches interim, final, NoMatch and cancellation and cleans resources", async () => {
  const recognitions: SpeechRecognition[] = [];
  const lifecycle: string[] = [];
  let noMatches = 0;
  let errors = 0;
  let configuredLanguages: string[] = [];
  const recognizer = {
    recognizing: null as ((sender: unknown, event: { result: { reason: unknown; text: string; language?: string } }) => void) | null,
    recognized: null as ((sender: unknown, event: { result: { reason: unknown; text: string; language?: string } }) => void) | null,
    canceled: null as (() => void) | null,
    authorizationToken: "",
    startContinuousRecognitionAsync: (resolve: () => void) => {
      lifecycle.push("start");
      resolve();
    },
    stopContinuousRecognitionAsync: (resolve: () => void) => {
      lifecycle.push("stop");
      resolve();
    },
    close: () => lifecycle.push("recognizer-close")
  };
  const sdk: SpeechSdkFacade = {
    SpeechConfig: {
      fromEndpoint: () => ({
        authorizationToken: "",
        setProperty: (_property, value) => lifecycle.push(`mode:${value}`)
      })
    },
    PropertyId: { SpeechServiceConnection_LanguageIdMode: "language-mode" },
    AutoDetectSourceLanguageConfig: {
      fromLanguages: (languages) => {
        configuredLanguages = languages;
        return {};
      }
    },
    AudioConfig: { fromDefaultMicrophoneInput: () => ({ close: () => lifecycle.push("audio-close") }) },
    SpeechRecognizer: { FromConfig: () => recognizer },
    AutoDetectSourceLanguageResult: {
      fromResult: (result) => ({ language: (result as typeof result & { language?: string }).language ?? "" })
    },
    ResultReason: { RecognizingSpeech: "recognizing", RecognizedSpeech: "recognized", NoMatch: "no-match" }
  };
  const session = createSpeechSession(
    "https://speech.example",
    "initial-token",
    {
      onRecognition: (recognition) => recognitions.push(recognition),
      onNoMatch: () => {
        noMatches += 1;
      },
      onError: () => {
        errors += 1;
      }
    },
    sdk
  );

  await session.start();
  recognizer.recognizing?.(null, { result: { reason: "recognizing", text: "hello", language: "en-US" } });
  recognizer.recognized?.(null, { result: { reason: "recognized", text: "你好", language: "zh-CN" } });
  recognizer.recognized?.(null, { result: { reason: "no-match", text: "" } });
  recognizer.canceled?.();
  session.updateAuthorizationToken("refreshed-token");
  await session.stop();

  assert.deepEqual(configuredLanguages, ["en-US", "zh-CN"]);
  assert.deepEqual(recognitions, [
    { text: "hello", language: "en-US", final: false },
    { text: "你好", language: "zh-CN", final: true }
  ]);
  assert.equal(noMatches, 1);
  assert.equal(errors, 1);
  assert.equal(recognizer.authorizationToken, "refreshed-token");
  assert.deepEqual(lifecycle, ["mode:Continuous", "start", "stop", "recognizer-close", "audio-close"]);
});
