import type { TranslationEvent, TranslationRequest } from "../shared/contracts.ts";
import { parseTranslationEvent } from "../shared/schemas.ts";

export async function streamTranslation(
  request: TranslationRequest,
  signal: AbortSignal,
  onEvent: (event: TranslationEvent) => void
): Promise<void> {
  const response = await fetch("/api/translations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal
  });
  if (!response.ok || !response.body) throw new Error("TRANSLATION_FAILED");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value = "" } = await reader.read();
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line) onEvent(parseTranslationEvent(JSON.parse(line)));
    if (done) break;
  }
  if (buffer.trim()) onEvent(parseTranslationEvent(JSON.parse(buffer)));
}
