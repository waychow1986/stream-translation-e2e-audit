import { describe, expect, it } from "vitest";
import { RecordingSpeechAdapter } from "../../src/server/adapters/deterministic.js";

describe("speech stream adapter", () => {
  it("preserves PCM order and emits finalized segments only", async () => {
    const adapter = new RecordingSpeechAdapter();
    await adapter.start();
    adapter.push(Buffer.alloc(320, 1));
    adapter.push(Buffer.alloc(320, 2));
    await adapter.stop();
    expect(adapter.audio.subarray(0, 320)).toEqual(Buffer.alloc(320, 1));
    expect(adapter.audio.subarray(320)).toEqual(Buffer.alloc(320, 2));
    expect(adapter.segments).toHaveLength(2);
    expect(adapter.segments.every((segment) => segment.isFinal)).toBe(true);
  });

  it("cancels idempotently", async () => {
    const adapter = new RecordingSpeechAdapter();
    await adapter.cancel();
    await adapter.cancel();
    expect(adapter.cancelled).toBe(true);
  });
});
