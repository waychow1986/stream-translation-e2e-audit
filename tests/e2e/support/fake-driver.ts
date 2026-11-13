import type { Page } from "@playwright/test";

type Scenario = "english" | "interleaved" | "chinese" | "many" | "recovery" | "lifecycle";

interface RecognitionInput {
  delay: number;
  text: string;
  language: "en-US" | "zh-CN" | null;
  final: boolean;
}

export interface ProtocolEvidence {
  starts: number;
  stops: number;
  tokenUpdates: string[];
  translationRequests: Array<{ segmentId: string; revision: number; mode: string; text: string }>;
}

export async function installDriver(page: Page, scenario: Scenario): Promise<ProtocolEvidence> {
  const evidence: ProtocolEvidence = { starts: 0, stops: 0, tokenUpdates: [], translationRequests: [] };
  await page.exposeFunction("__recordCaptionProtocolEvent", (event: { type: "start" | "stop" | "token"; value?: string }) => {
    if (event.type === "start") evidence.starts += 1;
    else if (event.type === "stop") evidence.stops += 1;
    else evidence.tokenUpdates.push(event.value ?? "");
  });

  let tokenRequests = 0;
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { speechEndpoint: "https://speech.example", candidateLanguages: ["en-US", "zh-CN"] } })
  );
  await page.route("**/api/speech-token", (route) => {
    tokenRequests += 1;
    const expiresAt =
      scenario === "lifecycle" && tokenRequests === 1
        ? new Date(Date.now() + 2 * 60_000).toISOString()
        : new Date(Date.now() + 10 * 60_000).toISOString();
    return route.fulfill({ json: { authorizationToken: `token-${tokenRequests}`, expiresAt } });
  });
  await page.route("**/api/translations", async (route) => {
    const request = route.request().postDataJSON() as ProtocolEvidence["translationRequests"][number];
    evidence.translationRequests.push(request);
    if (scenario === "recovery" && evidence.translationRequests.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: "DEPENDENCY_FAILED" } } });
      return;
    }
    if (scenario === "interleaved" && request.segmentId === "1") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const text = translatedText(request.text, request.mode);
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${JSON.stringify({ type: "delta", text })}\n${JSON.stringify({ type: "completed", text })}\n`
    });
  });

  await page.addInitScript(
    ({ selected, inputs }) => {
      let sessionNumber = 0;
      Object.defineProperty(window, "__CAPTION_PROTOCOL_ADAPTER__", {
        value: {
          createSpeechSession(callbacks: {
            onRecognition(input: RecognitionInput): void;
            onNoMatch(): void;
            onError(): void;
          }) {
            sessionNumber += 1;
            const timers: number[] = [];
            return {
              async start() {
                await (
                  window as typeof window & {
                    __recordCaptionProtocolEvent(event: { type: "start" | "stop" | "token"; value?: string }): Promise<void>;
                  }
                ).__recordCaptionProtocolEvent({ type: "start" });
                const events =
                  selected === "recovery" && sessionNumber > 1
                    ? [{ delay: 0, text: "new session", language: "en-US" as const, final: true }]
                    : inputs;
                for (const event of events) {
                  timers.push(window.setTimeout(() => callbacks.onRecognition(event), event.delay));
                }
              },
              async stop() {
                for (const timer of timers) window.clearTimeout(timer);
                await (
                  window as typeof window & {
                    __recordCaptionProtocolEvent(event: { type: "stop" | "token"; value?: string }): Promise<void>;
                  }
                ).__recordCaptionProtocolEvent({ type: "stop" });
              },
              updateAuthorizationToken(token: string) {
                void (
                  window as typeof window & {
                    __recordCaptionProtocolEvent(event: { type: "stop" | "token"; value?: string }): Promise<void>;
                  }
                ).__recordCaptionProtocolEvent({ type: "token", value: token });
              }
            };
          }
        }
      });
    },
    { selected: scenario, inputs: recognitionInputs(scenario) }
  );
  return evidence;
}

function recognitionInputs(scenario: Scenario): RecognitionInput[] {
  if (scenario === "english") {
    return [
      { delay: 0, text: "hello ", language: "en-US", final: false },
      { delay: 700, text: "hello world ", language: "en-US", final: false },
      { delay: 1_400, text: "hello world", language: "en-US", final: true }
    ];
  }
  if (scenario === "interleaved") {
    return [
      { delay: 0, text: "first segment", language: "en-US", final: true },
      { delay: 10, text: "second segment", language: "en-US", final: true }
    ];
  }
  if (scenario === "chinese") {
    return [
      { delay: 0, text: "你好", language: "zh-CN", final: false },
      { delay: 500, text: "你好世界", language: "zh-CN", final: false },
      { delay: 1_000, text: "你好世界", language: "zh-CN", final: true }
    ];
  }
  if (scenario === "many") {
    return Array.from({ length: 12 }, (_, index) => ({
      delay: index * 10,
      text: `字幕 ${index + 1}`,
      language: "zh-CN" as const,
      final: true
    }));
  }
  if (scenario === "recovery") {
    return [
      { delay: 0, text: "will fail", language: "en-US", final: true },
      { delay: 100, text: "must not replay", language: "en-US", final: true }
    ];
  }
  return [];
}

function translatedText(text: string, mode: string): string {
  if (text === "first segment") return "第一段";
  if (text === "second segment") return "第二段";
  if (text === "new session") return "新会话";
  if (mode === "final") return "你好世界";
  return text.trim() === "hello" ? "你好" : "你好世界草稿";
}
