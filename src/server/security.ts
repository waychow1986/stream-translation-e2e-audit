export const securityHeaders = {
  "content-security-policy": "default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; script-src 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer"
} as const;

export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
