const sensitiveKeys = /^(text|textDelta|audio|token|authorization|body|endpoint|speechResourceId)$/i;

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKeys.test(key) ? "[REDACTED]" : redactLogValue(item)
  ]));
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify(redactLogValue({
    timestamp: new Date().toISOString(),
    level: "info",
    event,
    ...fields
  }))}\n`);
}
