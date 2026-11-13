import { describe, expect, it } from "vitest";
import { RecordingSpeechAdapter } from "../../src/server/adapters/deterministic.js";

describe("speech stream adapter", () => {
  it("preserves PCM order and emits finalized segments only", async () => {
    const adapter = new RecordingSpeechAdapter();
    await adapter.start();
    adapter.push(Buffer.from([1, 2]));
    adapter.push(Buffer.from([3, 4]));
    await adapter.stop();
    expect(adapter.audio).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(adapter.segments.every((segment) => segment.isFinal)).toBe(true);
  });

  it("cancels idempotently", async () => {
    const adapter = new RecordingSpeechAdapter();
    await adapter.cancel();
    await adapter.cancel();
    expect(adapter.cancelled).toBe(true);
  });
});
