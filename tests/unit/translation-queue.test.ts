import { describe, expect, it } from "vitest";
import { TranslationQueue } from "../../src/server/translation-queue.js";

describe("translation FIFO", () => {
  it("finishes one segment before starting the next", async () => {
    const order: string[] = [];
    const queue = new TranslationQueue(async (segment) => {
      order.push(`start-${segment.segmentId}`);
      await Promise.resolve();
      order.push(`end-${segment.segmentId}`);
    });
    queue.enqueue({ segmentId: 1, detectedLanguage: "en-US", text: "one", isFinal: true, speechResultId: "s1" });
    queue.enqueue({ segmentId: 2, detectedLanguage: "en-US", text: "two", isFinal: true, speechResultId: "s2" });
    await queue.drain();
    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });
});
