import { describe, expect, it } from "vitest";
import { deterministicAdapters } from "../../src/server/adapters/deterministic.js";
import { TranslationSession } from "../../src/server/translation-session.js";

describe("server resource cleanup", () => {
  it("cancels dependencies on disconnect and emits one terminal failure", async () => {
    const adapters = deterministicAdapters();
    const events: unknown[] = [];
    const session = new TranslationSession(adapters, (event) => events.push(event));
    await session.start();
    await session.fail("INTERNAL_ERROR");
    await session.fail("INTERNAL_ERROR");
    expect(events.filter((event) => (event as { type: string }).type === "session.failed")).toHaveLength(1);
    expect((adapters.speech as unknown as { cancelled: boolean }).cancelled).toBe(true);
  });
});
