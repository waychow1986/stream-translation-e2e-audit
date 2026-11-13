import type { Dispatch } from "react";
import { createSpeechSession, tokenRefreshDelay } from "./speech-adapter.ts";
import type { SpeechRecognition, SpeechSession } from "./speech-types.ts";
import { streamTranslation } from "./translation-client.ts";
import { TranslationScheduler } from "./translation-scheduler.ts";
import type { SourceLanguage, TranslationEvent } from "../shared/contracts.ts";
import type { CaptionAction } from "./caption-reducer.ts";

export function routeRecognition(language: string | null): "translate" | "display" | "reject" {
  if (language === "en-US") return "translate";
  if (language === "zh-CN") return "display";
  return "reject";
}

export class SessionResources {
  private readonly disposers: Array<() => unknown | Promise<unknown>> = [];
  private disposed = false;
  add(disposer: () => unknown | Promise<unknown>): void {
    this.disposers.push(disposer);
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposers.reverse()) await dispose();
  }
}

type CaptionDispatch = Dispatch<CaptionAction>;

interface BrowserConfig {
  speechEndpoint: string;
  candidateLanguages: SourceLanguage[];
}

interface SpeechTokenResponse {
  authorizationToken: string;
  expiresAt: string;
}

export class SessionController {
  private readonly dispatch: CaptionDispatch;
  private readonly resources = new SessionResources();
  private speech: SpeechSession | null = null;
  private segmentNumber = 0;
  private revision = 0;
  private segmentId = "";
  private scheduler: TranslationScheduler | null = null;
  private translationAbort: AbortController | null = null;

  constructor(dispatch: CaptionDispatch) {
    this.dispatch = dispatch;
  }

  async start(): Promise<void> {
    const config = await getJson<BrowserConfig>("/api/config");
    const token = await postToken();
    this.speech = createSpeechSession(config.speechEndpoint, token.authorizationToken, {
      onRecognition: (result) => void this.onRecognition(result),
      onNoMatch: () => undefined,
      onError: () => void this.stop()
    });
    this.resources.add(() => this.translationAbort?.abort());
    this.resources.add(() => this.scheduler?.dispose());
    this.resources.add(() => this.speech?.stop());
    this.scheduleTokenRefresh(token);
    await this.speech.start();
  }

  async stop(): Promise<void> {
    await this.resources.dispose();
    this.dispatch({ type: "clearCurrent" });
  }

  private async onRecognition(result: SpeechRecognition): Promise<void> {
    const route = routeRecognition(result.language);
    if (route === "reject") {
      await this.stop();
      return;
    }
    const language = result.language as SourceLanguage;
    if (!this.segmentId) {
      this.segmentNumber += 1;
      this.segmentId = String(this.segmentNumber);
      this.revision = 0;
      this.scheduler = new TranslationScheduler((text) => void this.translate(text, false));
    }
    this.revision += 1;
    this.dispatch({
      type: "recognizing",
      segmentId: this.segmentId,
      language,
      sourceText: result.text,
      revision: this.revision
    });
    if (route === "display" && result.final) {
      this.dispatch({ type: "recognizedChinese", segmentId: this.segmentId, sourceText: result.text, revision: this.revision });
      this.resetSegment();
    } else if (route === "translate" && result.final) {
      this.scheduler?.dispose();
      await this.translate(result.text, true);
    } else if (route === "translate") {
      this.scheduler?.update(result.text);
    }
  }

  private async translate(text: string, final: boolean): Promise<void> {
    if (text.length > 4000) {
      this.dispatch({ type: "clearCurrent" });
      return;
    }
    this.translationAbort?.abort();
    const abort = new AbortController();
    this.translationAbort = abort;
    const requestId = crypto.randomUUID();
    const revision = this.revision;
    this.dispatch({ type: "translationStarted", segmentId: this.segmentId, revision, requestId, final, sourceText: text });
    let first = true;
    try {
      await streamTranslation(
        { segmentId: this.segmentId, revision, mode: final ? "final" : "draft", sourceLanguage: "en-US", text },
        abort.signal,
        (event: TranslationEvent) => {
          if (event.type === "delta") {
            this.dispatch({ type: "translationDelta", segmentId: this.segmentId, revision, requestId, text: event.text, first });
            first = false;
          } else if (event.type === "completed" && final) {
            this.dispatch({ type: "translationCompleted", segmentId: this.segmentId, revision, requestId });
            this.resetSegment();
          } else if (event.type === "error" && event.code !== "CANCELLED") {
            this.dispatch({ type: "clearCurrent" });
          }
        }
      );
    } catch (error) {
      if (!abort.signal.aborted) this.dispatch({ type: "clearCurrent" });
    }
  }

  private scheduleTokenRefresh(token: SpeechTokenResponse): void {
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await postToken();
        this.speech?.updateAuthorizationToken(refreshed.authorizationToken);
        this.scheduleTokenRefresh(refreshed);
      } catch {
        await this.stop();
      }
    }, tokenRefreshDelay(Date.parse(token.expiresAt)));
    this.resources.add(() => window.clearTimeout(timer));
  }

  private resetSegment(): void {
    this.scheduler?.dispose();
    this.scheduler = null;
    this.segmentId = "";
    this.revision = 0;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("CONFIG_FAILED");
  return response.json() as Promise<T>;
}

async function postToken(): Promise<SpeechTokenResponse> {
  const response = await fetch("/api/speech-token", { method: "POST", headers: { origin: window.location.origin } });
  if (!response.ok) throw new Error("TOKEN_FAILED");
  return response.json() as Promise<SpeechTokenResponse>;
}
