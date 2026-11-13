import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { clientMessageSchema, serverEventSchema } from "../../src/shared/protocol.js";

describe("protocol v1", () => {
  it("accepts the fixed start contract and rejects unknown fields", () => {
    const start = {
      type: "start",
      protocolVersion: 1,
      audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
    };
    expect(Value.Check(clientMessageSchema, start)).toBe(true);
    expect(Value.Check(clientMessageSchema, { ...start, extra: true })).toBe(false);
    expect(Value.Check(clientMessageSchema, { ...start, protocolVersion: 2 })).toBe(false);
  });

  it("requires monotonic event fields and stable target language", () => {
    expect(Value.Check(serverEventSchema, {
      type: "subtitle.delta",
      segmentId: 1,
      revision: 1,
      textDelta: "你",
      targetLanguage: "zh-CN"
    })).toBe(true);
    expect(Value.Check(serverEventSchema, {
      type: "session.failed",
      code: "raw Azure error"
    })).toBe(false);
  });
});
