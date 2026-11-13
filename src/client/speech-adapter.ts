import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import type { SourceLanguage } from "../shared/contracts.ts";
import type { SpeechSession, SpeechSessionCallbacks } from "./speech-types.ts";

export const candidateLanguages = ["en-US", "zh-CN"] as const;

export function tokenRefreshDelay(expiresAt: number, now = Date.now()): number {
  return Math.max(0, expiresAt - now - 2 * 60_000);
}

function detectedLanguage(result: SpeechSDK.SpeechRecognitionResult): SourceLanguage | null {
  const language = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result).language;
  return candidateLanguages.includes(language as SourceLanguage) ? (language as SourceLanguage) : null;
}

export function createSpeechSession(
  endpoint: string,
  authorizationToken: string,
  callbacks: SpeechSessionCallbacks
): SpeechSession {
  const speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL(endpoint));
  speechConfig.authorizationToken = authorizationToken;
  speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");
  const languageConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages([...candidateLanguages]);
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, languageConfig, audioConfig);
  recognizer.recognizing = (_sender, event) => {
    if (event.result.reason === SpeechSDK.ResultReason.RecognizingSpeech && event.result.text) {
      callbacks.onRecognition({ text: event.result.text, language: detectedLanguage(event.result), final: false });
    }
  };
  recognizer.recognized = (_sender, event) => {
    if (event.result.reason === SpeechSDK.ResultReason.NoMatch) callbacks.onNoMatch();
    else if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && event.result.text) {
      callbacks.onRecognition({ text: event.result.text, language: detectedLanguage(event.result), final: true });
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
