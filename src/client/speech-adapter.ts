import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import type { SourceLanguage } from "../shared/contracts.ts";
import type { SpeechSession, SpeechSessionCallbacks } from "./speech-types.ts";

export const candidateLanguages = ["en-US", "zh-CN"] as const;

interface RecognitionResultLike {
  reason: unknown;
  text: string;
}

interface RecognizerLike {
  recognizing: ((sender: unknown, event: { result: RecognitionResultLike }) => void) | null;
  recognized: ((sender: unknown, event: { result: RecognitionResultLike }) => void) | null;
  canceled: (() => void) | null;
  authorizationToken: string;
  startContinuousRecognitionAsync(resolve: () => void, reject: (error: unknown) => void): void;
  stopContinuousRecognitionAsync(resolve: () => void, reject: (error: unknown) => void): void;
  close(): void;
}

export interface SpeechSdkFacade {
  SpeechConfig: {
    fromEndpoint(endpoint: URL): {
      authorizationToken: string;
      setProperty(property: unknown, value: string): void;
    };
  };
  PropertyId: { SpeechServiceConnection_LanguageIdMode: unknown };
  AutoDetectSourceLanguageConfig: { fromLanguages(languages: string[]): unknown };
  AudioConfig: { fromDefaultMicrophoneInput(): { close(): void } };
  SpeechRecognizer: {
    FromConfig(speechConfig: unknown, languageConfig: unknown, audioConfig: unknown): RecognizerLike;
  };
  AutoDetectSourceLanguageResult: {
    fromResult(result: RecognitionResultLike): { language: string };
  };
  ResultReason: {
    RecognizingSpeech: unknown;
    RecognizedSpeech: unknown;
    NoMatch: unknown;
  };
}

export function tokenRefreshDelay(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now - 2 * 60_000);
}

function detectedLanguage(result: RecognitionResultLike, sdk: SpeechSdkFacade): SourceLanguage | null {
  const language = sdk.AutoDetectSourceLanguageResult.fromResult(result).language;
  return candidateLanguages.includes(language as SourceLanguage) ? (language as SourceLanguage) : null;
}

export function createSpeechSession(
  endpoint: string,
  authorizationToken: string,
  callbacks: SpeechSessionCallbacks,
  sdk: SpeechSdkFacade = SpeechSDK as unknown as SpeechSdkFacade
): SpeechSession {
  const speechConfig = sdk.SpeechConfig.fromEndpoint(new URL(endpoint));
  speechConfig.authorizationToken = authorizationToken;
  speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
  const languageConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages([...candidateLanguages]);
  const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, languageConfig, audioConfig);
  recognizer.recognizing = (_sender, event) => {
    if (event.result.reason === sdk.ResultReason.RecognizingSpeech && event.result.text) {
      callbacks.onRecognition({ text: event.result.text, language: detectedLanguage(event.result, sdk), final: false });
    }
  };
  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === sdk.ResultReason.NoMatch) callbacks.onNoMatch();
    else if (event.result.reason === sdk.ResultReason.RecognizedSpeech && event.result.text) {
      callbacks.onRecognition({ text: event.result.text, language: detectedLanguage(event.result, sdk), final: true });
    }
  };
  recognizer.canceled = () => callbacks.onError();

  return {
    start: () => new Promise((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, reject)),
    stop: () =>
      new Promise((resolve, reject) =>
        recognizer.stopContinuousRecognitionAsync(() => {
          recognizer.close();
          audioConfig.close();
          resolve();
        }, reject)
      ),
    updateAuthorizationToken: (token) => {
      recognizer.authorizationToken = token;
    }
  };
}
