import { DefaultAzureCredential } from "@azure/identity";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import type { RecognitionSegment } from "../../shared/types.js";
import { isValidSpeechResourceId, type AppConfig } from "../config.js";
import type { SpeechAdapter } from "./speech.js";

const tokenScope = "https://cognitiveservices.azure.com/.default";

interface AccessToken {
  token: string;
  expiresOnTimestamp: number;
}

interface TokenCredential {
  getToken(scope: string): Promise<AccessToken | null>;
}

interface SpeechConfigLike {
  authorizationToken: string;
  setProperty(property: unknown, value: string): void;
}

interface PushStreamLike {
  write(frame: ArrayBuffer): void;
  close(): void;
}

interface RecognizerLike {
  authorizationToken: string;
  recognized: ((sender: unknown, event: { result: { reason: unknown; text: string; resultId: string } }) => void) | undefined;
  canceled: ((sender?: unknown, event?: unknown) => void) | undefined;
  startContinuousRecognitionAsync(resolve: () => void, reject: (error: unknown) => void): void;
  stopContinuousRecognitionAsync(resolve: () => void, reject: (error: unknown) => void): void;
  close(): void;
}

export interface SpeechSdkFacade {
  propertyIdLanguageIdMode: unknown;
  recognizedSpeechReason: unknown;
  createSpeechConfig(endpoint: URL): SpeechConfigLike;
  createAutoDetectSourceLanguageConfig(languages: string[]): unknown;
  createPcmFormat(): unknown;
  createPushStream(format: unknown): PushStreamLike;
  createAudioConfig(stream: PushStreamLike): unknown;
  createRecognizer(config: SpeechConfigLike, autoDetect: unknown, audio: unknown): RecognizerLike;
  languageFromResult(result: unknown): string;
}

const speechSdkFacade: SpeechSdkFacade = {
  propertyIdLanguageIdMode: SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode,
  recognizedSpeechReason: SpeechSDK.ResultReason.RecognizedSpeech,
  createSpeechConfig: (endpoint) => SpeechSDK.SpeechConfig.fromEndpoint(endpoint),
  createAutoDetectSourceLanguageConfig: (languages) => SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages),
  createPcmFormat: () => SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16_000, 16, 1),
  createPushStream: (format) => SpeechSDK.AudioInputStream.createPushStream(format as SpeechSDK.AudioStreamFormat),
  createAudioConfig: (stream) => SpeechSDK.AudioConfig.fromStreamInput(stream as SpeechSDK.PushAudioInputStream),
  createRecognizer: (config, autoDetect, audio) => SpeechSDK.SpeechRecognizer.FromConfig(
    config as SpeechSDK.SpeechConfig,
    autoDetect as SpeechSDK.AutoDetectSourceLanguageConfig,
    audio as SpeechSDK.AudioConfig
  ) as unknown as RecognizerLike,
  languageFromResult: (result) => SpeechSDK.AutoDetectSourceLanguageResult.fromResult(
    result as SpeechSDK.SpeechRecognitionResult
  ).language
};

export function buildSpeechAuthorizationToken(resourceId: string, accessToken: string): string {
  if (!isValidSpeechResourceId(resourceId) || !accessToken) throw new Error("Invalid Speech authorization inputs");
  return `aad#${resourceId}#${accessToken}`;
}

export function isSupportedEnglish(language: string): boolean {
  return language.toLowerCase().split("-")[0] === "en";
}

export function nextRefreshDelay(expiresOnTimestamp: number, now = Date.now()): number {
  const remaining = Math.max(0, expiresOnTimestamp - now);
  return Math.max(1_000, remaining < 600_000 ? remaining / 2 : remaining - 300_000);
}

export class AzureSpeechAdapter implements SpeechAdapter {
  private readonly credential: TokenCredential;
  private readonly sdk: SpeechSdkFacade;
  private speechConfig?: SpeechConfigLike;
  private recognizer?: RecognizerLike;
  private stream?: PushStreamLike;
  private refreshTimer?: NodeJS.Timeout;
  private segmentId = 0;
  private cancelled = false;

  constructor(
    private readonly config: AppConfig,
    dependencies: { credential?: TokenCredential; sdk?: SpeechSdkFacade } = {}
  ) {
    this.credential = dependencies.credential
      ?? new DefaultAzureCredential({ managedIdentityClientId: config.azureClientId });
    this.sdk = dependencies.sdk ?? speechSdkFacade;
  }

  async start(onSegment?: (segment: RecognitionSegment) => void, onError?: () => void): Promise<void> {
    const token = await this.credential.getToken(tokenScope);
    if (!token?.expiresOnTimestamp) throw new Error("Speech access token unavailable");
    const authorization = buildSpeechAuthorizationToken(this.config.speechResourceId, token.token);
    this.speechConfig = this.sdk.createSpeechConfig(new URL(this.config.speechEndpoint));
    this.speechConfig.authorizationToken = authorization;
    this.speechConfig.setProperty(
      this.sdk.propertyIdLanguageIdMode,
      "Continuous"
    );
    const autoDetect = this.sdk.createAutoDetectSourceLanguageConfig(["en-US", "zh-CN"]);
    const format = this.sdk.createPcmFormat();
    this.stream = this.sdk.createPushStream(format);
    const audio = this.sdk.createAudioConfig(this.stream);
    this.recognizer = this.sdk.createRecognizer(this.speechConfig, autoDetect, audio);
    this.recognizer.authorizationToken = authorization;
    this.recognizer.recognized = (_sender, event) => {
      if (this.cancelled || event.result.reason !== this.sdk.recognizedSpeechReason) return;
      const language = this.sdk.languageFromResult(event.result);
      if (!isSupportedEnglish(language) || !event.result.text.trim()) return;
      onSegment?.({
        segmentId: ++this.segmentId,
        detectedLanguage: language,
        text: event.result.text,
        isFinal: true,
        speechResultId: event.result.resultId
      });
    };
    this.recognizer.canceled = () => onError?.();
    await new Promise<void>((resolve, reject) => this.recognizer!.startContinuousRecognitionAsync(resolve, reject));
    this.scheduleRefresh(token.expiresOnTimestamp, onError);
  }

  push(frame: Buffer): void {
    if (!this.stream || this.cancelled) throw new Error("Speech stream is not active");
    this.stream.write(Uint8Array.from(frame).buffer);
  }

  async stop(): Promise<void> {
    this.stream?.close();
    if (this.recognizer) {
      await new Promise<void>((resolve, reject) => this.recognizer!.stopContinuousRecognitionAsync(resolve, reject));
    }
    this.dispose();
  }

  async cancel(): Promise<void> {
    if (this.cancelled) return;
    this.cancelled = true;
    this.stream?.close();
    if (this.recognizer) {
      await new Promise<void>((resolve) => this.recognizer!.stopContinuousRecognitionAsync(resolve, () => resolve()));
    }
    this.dispose();
  }

  private scheduleRefresh(expiresOnTimestamp: number, onError?: () => void): void {
    this.refreshTimer = setTimeout(async () => {
      try {
        const token = await this.credential.getToken(tokenScope);
        if (!token?.expiresOnTimestamp || !this.speechConfig || !this.recognizer) throw new Error("Refresh failed");
        const authorization = buildSpeechAuthorizationToken(this.config.speechResourceId, token.token);
        this.speechConfig.authorizationToken = authorization;
        this.recognizer.authorizationToken = authorization;
        this.scheduleRefresh(token.expiresOnTimestamp, onError);
      } catch {
        onError?.();
      }
    }, nextRefreshDelay(expiresOnTimestamp));
    this.refreshTimer.unref();
  }

  private dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.recognizer?.close();
    this.recognizer = undefined;
    this.stream = undefined;
  }
}
