import assert from "node:assert/strict";
import test from "node:test";
import { SessionController, SessionResources, type SessionControllerDependencies } from "../../src/client/session-controller.ts";
import { captionReducer, initialCaptionState } from "../../src/client/caption-reducer.ts";
import type { CaptionState, TranslationEvent, TranslationRequest } from "../../src/shared/contracts.ts";
import type { SpeechSessionCallbacks } from "../../src/client/speech-types.ts";

test("stopping a session disposes recognition, timers and requests exactly once", async () => {
  const events: string[] = [];
  const resources = new SessionResources();
  resources.add(() => events.push("request"));
  resources.add(() => events.push("timer"));
  resources.add(async () => events.push("recognizer"));
  await resources.dispose();
  await resources.dispose();
  assert.deepEqual(events, ["recognizer", "timer", "request"]);
});

function controllerHarness(
  translate: SessionControllerDependencies["streamTranslation"],
  initialState: CaptionState = initialCaptionState
) {
  let state = initialState;
  let callbacks: SpeechSessionCallbacks | undefined;
  let stopCount = 0;
  let clearTimeoutCount = 0;
  const requests: TranslationRequest[] = [];
  const controller = new SessionController(
    (action) => {
      state = captionReducer(state, action);
    },
    {
      getConfig: async () => ({ speechEndpoint: "https://speech.example", candidateLanguages: ["en-US", "zh-CN"] }),
      getToken: async () => ({ authorizationToken: "token", expiresAt: "2099-01-01T00:00:00.000Z" }),
      createSpeechSession: (_endpoint, _token, handlers) => {
        callbacks = handlers;
        return {
          start: async () => undefined,
          stop: async () => {
            stopCount += 1;
          },
          updateAuthorizationToken: () => undefined
        };
      },
      streamTranslation: async (request, signal, onEvent) => {
        requests.push(request);
        await translate(request, signal, onEvent);
      },
      setTimeout: () => 1,
      clearTimeout: () => {
        clearTimeoutCount += 1;
      }
    }
  );
  return {
    controller,
    callbacks: () => {
      assert.ok(callbacks);
      return callbacks;
    },
    requests,
    state: () => state,
    stopCount: () => stopCount,
    clearTimeoutCount: () => clearTimeoutCount
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("an English final fixes before an interleaved next segment receives a new id", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const harness = controllerHarness(async (request, _signal, onEvent) => {
    if (request.segmentId === "1") await firstPending;
    onEvent({ type: "delta", text: request.segmentId === "1" ? "第一段" : "第二段" });
    onEvent({ type: "completed", text: request.segmentId === "1" ? "第一段" : "第二段" });
  });
  await harness.controller.start();

  harness.callbacks().onRecognition({ text: "first segment", language: "en-US", final: true });
  await settle();
  harness.callbacks().onRecognition({ text: "second segment", language: "en-US", final: true });
  await settle();
  assert.deepEqual(harness.requests.map((request) => request.segmentId), ["1"]);

  releaseFirst?.();
  await settle();
  await settle();

  assert.deepEqual(harness.requests.map((request) => request.segmentId), ["1", "2"]);
  assert.deepEqual(harness.state().fixedSegments.map((segment) => [segment.id, segment.displayText]), [
    ["1", "第一段"],
    ["2", "第二段"]
  ]);
});

for (const failure of ["ndjson", "fetch"] as const) {
  test(`${failure} translation failure terminates the session and ignores later recognition`, async () => {
    let existing = captionReducer(initialCaptionState, {
      type: "recognizing",
      segmentId: "fixed",
      language: "zh-CN",
      sourceText: "保留",
      revision: 1
    });
    existing = captionReducer(existing, {
      type: "recognizedChinese",
      segmentId: "fixed",
      sourceText: "保留",
      revision: 2
    });
    const harness = controllerHarness(async (_request, _signal, onEvent) => {
      if (failure === "ndjson") onEvent({ type: "error", code: "DEPENDENCY_FAILED" });
      else throw new Error("dependency unavailable");
    }, existing);
    await harness.controller.start();
    harness.callbacks().onRecognition({ text: "will fail", language: "en-US", final: true });
    await settle();
    harness.callbacks().onRecognition({ text: "must not replay", language: "en-US", final: true });
    await settle();

    assert.equal(harness.stopCount(), 1);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state().current, null);
    assert.equal(harness.state().fixedSegments[0]?.displayText, "保留");
  });
}

test("oversized English interim terminates resources, preserves fixed captions and requires a new session", async () => {
  let existing = captionReducer(initialCaptionState, {
    type: "recognizing",
    segmentId: "fixed",
    language: "zh-CN",
    sourceText: "保留",
    revision: 1
  });
  existing = captionReducer(existing, {
    type: "recognizedChinese",
    segmentId: "fixed",
    sourceText: "保留",
    revision: 2
  });
  const failed = controllerHarness(async () => assert.fail("oversized text must not be translated"), existing);
  await failed.controller.start();
  failed.callbacks().onRecognition({ text: "x".repeat(4_001), language: "en-US", final: false });
  await settle();
  failed.callbacks().onRecognition({ text: "ignored stale event", language: "en-US", final: true });
  await settle();
  assert.equal(failed.stopCount(), 1);
  assert.ok(failed.clearTimeoutCount() > 0);
  assert.equal(failed.requests.length, 0);
  assert.equal(failed.state().current, null);
  assert.equal(failed.state().fixedSegments[0]?.displayText, "保留");

  const restarted = controllerHarness(async (_request, _signal, onEvent: (event: TranslationEvent) => void) => {
    onEvent({ type: "delta", text: "新会话" });
    onEvent({ type: "completed", text: "新会话" });
  });
  await restarted.controller.start();
  restarted.callbacks().onRecognition({ text: "new session", language: "en-US", final: true });
  await settle();
  assert.equal(restarted.requests.length, 1);
  assert.equal(restarted.state().fixedSegments[0]?.displayText, "新会话");
});
