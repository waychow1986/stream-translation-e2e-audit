import type { FastifyInstance } from "fastify";

export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function installSecurity(app: FastifyInstance, speechEndpoint: string): void {
  const speechOrigin = new URL(speechEndpoint).origin;
  app.addHook("onRequest", async (request, reply) => {
    reply.headers({
      "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${speechOrigin} ${speechOrigin.replace("https:", "wss:")}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff"
    });
    if (request.method !== "GET" && !isSameOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(403).send({ error: { code: "ORIGIN_REJECTED" } });
    }
  });
}
