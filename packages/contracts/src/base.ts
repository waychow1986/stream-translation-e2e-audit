import { z } from "zod";

export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "ORIGIN_REJECTED",
  "LANGUAGE_CATALOG_INVALID",
  "SPEECH_TOKEN_UNAVAILABLE",
  "TRANSLATION_UPSTREAM",
  "PROTOCOL_ERROR",
]);

export const interruptionStageSchema = z.enum([
  "capture",
  "speech",
  "language-detection",
  "translation",
  "configuration",
]);

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    stage: interruptionStageSchema,
    requestId: z.string().min(1),
  }),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type InterruptionStage = z.infer<typeof interruptionStageSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function createErrorEnvelope(
  code: ErrorCode,
  stage: InterruptionStage,
  requestId: string,
): ErrorEnvelope {
  return errorEnvelopeSchema.parse({
    error: { code, stage, requestId },
  });
}

export interface SseFrame<T = unknown> {
  event: string;
  data: T;
}

const sseEventName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function encodeSseFrame<T>(event: string, data: T): string {
  if (!sseEventName.test(event)) {
    throw new Error("Invalid SSE event name");
  }

  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function decodeSseFrames(stream: string): SseFrame[] {
  if (stream.length === 0) {
    return [];
  }

  return stream
    .replaceAll("\r\n", "\n")
    .split("\n\n")
    .filter((block) => block.length > 0)
    .map((block) => {
      let event: string | undefined;
      let data: unknown;
      let hasData = false;

      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) {
          event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          if (hasData) {
            throw new Error("SSE frame contains multiple data fields");
          }
          data = JSON.parse(line.slice(6));
          hasData = true;
        } else if (line.length > 0) {
          throw new Error("Unsupported SSE field");
        }
      }

      if (!event || !sseEventName.test(event) || !hasData) {
        throw new Error("Invalid SSE frame");
      }

      return { event, data };
    });
}
