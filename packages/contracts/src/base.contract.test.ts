import { describe, expect, it } from "vitest";

import {
  createErrorEnvelope,
  decodeSseFrames,
  encodeSseFrame,
  errorEnvelopeSchema,
} from "./base.js";

describe("error envelope contract", () => {
  it("accepts every stable code and stage", () => {
    const codes = [
      "INVALID_REQUEST",
      "ORIGIN_REJECTED",
      "LANGUAGE_CATALOG_INVALID",
      "SPEECH_TOKEN_UNAVAILABLE",
      "TRANSLATION_UPSTREAM",
      "PROTOCOL_ERROR",
    ] as const;
    const stages = [
      "capture",
      "speech",
      "language-detection",
      "translation",
      "configuration",
    ] as const;

    for (const code of codes) {
      for (const stage of stages) {
        expect(
          errorEnvelopeSchema.parse({
            error: { code, stage, requestId: "request-1" },
          }),
        ).toEqual({ error: { code, stage, requestId: "request-1" } });
      }
    }
  });

  it("rejects malformed envelopes", () => {
    expect(() =>
      errorEnvelopeSchema.parse({
        error: {
          code: "UNKNOWN",
          stage: "configuration",
          requestId: "request-1",
        },
      }),
    ).toThrow();
    expect(() =>
      errorEnvelopeSchema.parse({
        error: {
          code: "INVALID_REQUEST",
          stage: "configuration",
          requestId: "",
        },
      }),
    ).toThrow();
  });

  it("accepts compatible fields but strips them from output", () => {
    expect(
      errorEnvelopeSchema.parse({
        error: {
          code: "INVALID_REQUEST",
          stage: "configuration",
          requestId: "request-1",
          futureField: "compatible",
        },
        futureEnvelopeField: true,
      }),
    ).toEqual({
      error: {
        code: "INVALID_REQUEST",
        stage: "configuration",
        requestId: "request-1",
      },
    });
  });

  it("cannot include transcript, subtitle, provider text, credentials, or stack", () => {
    const envelope = createErrorEnvelope(
      "INVALID_REQUEST",
      "configuration",
      "request-1",
    );
    const serialized = JSON.stringify(envelope);

    expect(serialized).toBe(
      '{"error":{"code":"INVALID_REQUEST","stage":"configuration","requestId":"request-1"}}',
    );
    expect(serialized).not.toMatch(
      /transcript|subtitle|provider|credential|authorization|stack/i,
    );
  });
});

describe("SSE base frame contract", () => {
  it("round-trips JSON data without emitting multiline data fields", () => {
    const encoded = encodeSseFrame("translation.delta", {
      delta: "第一行\n第二行",
      sequence: 1,
    });

    expect(encoded).toBe(
      'event: translation.delta\ndata: {"delta":"第一行\\n第二行","sequence":1}\n\n',
    );
    expect(decodeSseFrames(encoded)).toEqual([
      {
        event: "translation.delta",
        data: { delta: "第一行\n第二行", sequence: 1 },
      },
    ]);
  });

  it("decodes multiple frames and rejects malformed or injectable frames", () => {
    const stream =
      encodeSseFrame("translation.delta", { delta: "中" }) +
      encodeSseFrame("translation.completed", { sequence: 1 });

    expect(decodeSseFrames(stream)).toHaveLength(2);
    expect(() => encodeSseFrame("bad\nevent", {})).toThrow();
    expect(() =>
      decodeSseFrames("event: translation.delta\ndata: not-json\n\n"),
    ).toThrow();
    expect(() => decodeSseFrames("data: {}\n\n")).toThrow();
  });
});
