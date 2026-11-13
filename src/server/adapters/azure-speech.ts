import { DefaultAzureCredential } from "@azure/identity";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import type { RecognitionSegment } from "../../shared/types.js";
import { isValidSpeechResourceId, type AppConfig } from "../config.js";
import type { SpeechAdapter } from "./speech.js";

const tokenScope = "https://cognitiveservices.azure.com/.default";

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
  private readonly credential: DefaultAzureCredential;
  private speechConfig?: SpeechSDK.SpeechConfig;
  private recognizer?: SpeechSDK.SpeechRecognizer;
  private stream?: SpeechSDK.PushAudioInputStream;
  private refreshTimer?: NodeJS.Timeout;
  private segmentId = 0;
  private cancelled = false;

  constructor(private readonly config: AppConfig) {
    this.credential = new DefaultAzureCredential({ managedIdentityClientId: config.azureClientId });
  }

  async start(onSegment?: (segment: RecognitionSegment) => void, onError?: () => void): Promise<void> {
    const token = await this.credential.getToken(tokenScope);
    if (!token?.expiresOnTimestamp) throw new Error("Speech access token unavailable");
    const authorization = buildSpeechAuthorizationToken(this.config.speechResourceId, token.token);
    this.speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL(this.config.speechEndpoint));
    this.speechConfig.authorizationToken = authorization;
    this.speechConfig.setProperty(
      SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode,
      "Continuous"
    );
    const autoDetect = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "zh-CN"]);
    const format = SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16_000, 16, 1);
    this.stream = SpeechSDK.AudioInputStream.createPushStream(format);
    const audio = SpeechSDK.AudioConfig.fromStreamInput(this.stream);
    this.recognizer = SpeechSDK.SpeechRecognizer.FromConfig(this.speechConfig, autoDetect, audio);
    this.recognizer.authorizationToken = authorization;
    this.recognizer.recognized = (_sender, event) => {
      if (this.cancelled || event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) return;
      const language = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(event.result).language;
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
