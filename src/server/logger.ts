const sensitiveKeys = /authorization|token|text|body|headers|query|audio/i;

export function redactLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : redactLogValue(item)])
    );
  }
  return value;
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify(redactLogValue({ timestamp: new Date().toISOString(), level: "info", event, ...fields }))}\n`);
}
