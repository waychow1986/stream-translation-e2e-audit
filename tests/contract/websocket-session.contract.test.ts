import { describe, expect, it, vi } from "vitest";
import { TranslationSession } from "../../src/server/translation-session.js";
import { deterministicAdapters } from "../../src/server/adapters/deterministic.js";
import type { SpeechAdapter } from "../../src/server/adapters/speech.js";

describe("WebSocket session orchestration", () => {
  it("rejects audio before started and drains accepted audio", async () => {
    const events: unknown[] = [];
    const session = new TranslationSession(deterministicAdapters(), (event) => events.push(event));
    expect(() => session.pushAudio(Buffer.from([0]))).toThrow();
    await session.start();
    session.pushAudio(Buffer.alloc(640));
    await session.stop();
    expect(events.at(0)).toMatchObject({ type: "session.started" });
    expect(events.at(-1)).toMatchObject({ type: "session.stopped" });
  });

  it("emits each model delta before the model stream finishes", async () => {
    const events: unknown[] = [];
    let emitSegment: Parameters<SpeechAdapter["start"]>[0];
    let finishStream!: () => void;
    const streamFinished = new Promise<void>((resolve) => { finishStream = resolve; });
    const speech: SpeechAdapter = {
      async start(onSegment) { emitSegment = onSegment; },
      push() {},
      async stop() {},
      async cancel() {}
    };
    const translator = {
      async translate(_text: string, _signal: AbortSignal, onDelta: (delta: string) => void) {
        onDelta("前");
        await streamFinished;
        onDelta("后");
        return { requestId: "model-1" };
      }
    };
    const session = new TranslationSession({ speech, translator }, (event) => events.push(event));

    await session.start();
    emitSegment!({
      segmentId: 1,
      detectedLanguage: "en-US",
      text: "hello",
      isFinal: true,
      speechResultId: "speech-1"
    });
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({ type: "subtitle.delta", textDelta: "前" }));
    });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "subtitle.final" }));

    finishStream();
    await session.stop();
    expect(events).toContainEqual(expect.objectContaining({ type: "subtitle.delta", textDelta: "后" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "subtitle.final", text: "前后" }));
  });
});
