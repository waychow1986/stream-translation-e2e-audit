import type { TranslationResult } from "../../shared/types.js";

export const FOUNDRY_SYSTEM_INSTRUCTION =
  "Translate the supplied English meeting segment into Simplified Chinese. Return only the translation.";

export interface FoundryRequest {
  system: string;
  input: string;
  stream: true;
  reasoning_effort: "none";
  signal: AbortSignal;
}

export type FoundryRequestExecutor = (request: FoundryRequest) => Promise<TranslationResult>;

export interface TranslationAdapter {
  translate(text: string, signal: AbortSignal): Promise<TranslationResult>;
}

export class FoundryTranslator implements TranslationAdapter {
  constructor(private readonly execute: FoundryRequestExecutor) {}

  translate(text: string, signal: AbortSignal): Promise<TranslationResult> {
    return this.execute({
      system: FOUNDRY_SYSTEM_INSTRUCTION,
      input: text,
      stream: true,
      reasoning_effort: "none",
      signal
    });
  }
}
