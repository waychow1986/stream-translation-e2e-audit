import { describe, expect, it } from "vitest";
import { TranslationSession } from "../../src/server/translation-session.js";
import { deterministicAdapters } from "../../src/server/adapters/deterministic.js";

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
});
