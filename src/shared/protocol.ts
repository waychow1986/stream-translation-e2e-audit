import { Type } from "@sinclair/typebox";

const strict = { additionalProperties: false } as const;

export const clientMessageSchema = Type.Union([
  Type.Object({
    type: Type.Literal("start"),
    protocolVersion: Type.Literal(1),
    audio: Type.Object({
      encoding: Type.Literal("pcm_s16le"),
      sampleRate: Type.Literal(16_000),
      channels: Type.Literal(1)
    }, strict)
  }, strict),
  Type.Object({ type: Type.Literal("stop") }, strict)
]);

const failureCodes = [
  "INVALID_AUDIO",
  "UNSUPPORTED_LANGUAGE",
  "SPEECH_UNAVAILABLE",
  "MODEL_UNAVAILABLE",
  "PROTOCOL_ERROR",
  "INTERNAL_ERROR"
] as const;

export const serverEventSchema = Type.Union([
  Type.Object({ type: Type.Literal("session.started"), protocolVersion: Type.Literal(1), sessionId: Type.String() }, strict),
  Type.Object({ type: Type.Literal("speech.final"), segmentId: Type.Integer({ minimum: 1 }), detectedLanguage: Type.String() }, strict),
  Type.Object({
    type: Type.Literal("subtitle.delta"),
    segmentId: Type.Integer({ minimum: 1 }),
    revision: Type.Integer({ minimum: 1 }),
    textDelta: Type.String(),
    targetLanguage: Type.Literal("zh-CN")
  }, strict),
  Type.Object({
    type: Type.Literal("subtitle.final"),
    segmentId: Type.Integer({ minimum: 1 }),
    revision: Type.Integer({ minimum: 1 }),
    text: Type.String(),
    targetLanguage: Type.Literal("zh-CN")
  }, strict),
  Type.Object({
    type: Type.Literal("dependency.evidence"),
    segmentId: Type.Integer({ minimum: 1 }),
    speechResultId: Type.String({ minLength: 1 }),
    modelRequestId: Type.String({ minLength: 1 })
  }, strict),
  Type.Object({ type: Type.Literal("session.stopped") }, strict),
  Type.Object({ type: Type.Literal("session.failed"), code: Type.Union(failureCodes.map((code) => Type.Literal(code))) }, strict)
]);
