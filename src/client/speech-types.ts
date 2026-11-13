import type { SourceLanguage } from "../shared/contracts.ts";

export interface SpeechRecognition {
  text: string;
  language: SourceLanguage | null;
  final: boolean;
}

export interface SpeechSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  updateAuthorizationToken(token: string): void;
}

export interface SpeechSessionCallbacks {
  onRecognition(result: SpeechRecognition): void;
  onNoMatch(): void;
  onError(): void;
}
