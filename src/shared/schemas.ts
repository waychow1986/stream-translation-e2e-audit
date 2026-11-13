import type { TranslationEvent, TranslationRequest } from "./contracts.ts";

export class ValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function parseTranslationRequest(input: unknown): TranslationRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("INVALID_REQUEST");
  const value = input as Record<string, unknown>;
  const expected = ["segmentId", "revision", "mode", "sourceLanguage", "text"];
  if (Object.keys(value).some((key) => !expected.includes(key))) throw new ValidationError("UNKNOWN_FIELD");
  if (typeof value.segmentId !== "string" || !value.segmentId) throw new ValidationError("INVALID_SEGMENT");
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new ValidationError("INVALID_REVISION");
  if (value.mode !== "draft" && value.mode !== "final") throw new ValidationError("INVALID_MODE");
  if (value.sourceLanguage !== "en-US") throw new ValidationError("INVALID_LANGUAGE");
  if (typeof value.text !== "string" || value.text.length === 0) throw new ValidationError("INVALID_TEXT");
  if (value.text.length > 4000) throw new ValidationError("TEXT_TOO_LARGE", 413);
  return value as unknown as TranslationRequest;
}

export function parseTranslationEvent(input: unknown): TranslationEvent {
  if (!input || typeof input !== "object") throw new ValidationError("INVALID_EVENT");
  const value = input as Record<string, unknown>;
  if ((value.type === "delta" || value.type === "completed") && typeof value.text === "string") {
    return { type: value.type, text: value.text };
  }
  if (value.type === "error" && ["DEPENDENCY_FAILED", "RATE_LIMITED", "CANCELLED"].includes(String(value.code))) {
    return value as unknown as TranslationEvent;
  }
  throw new ValidationError("INVALID_EVENT");
}
