import type { FastifyInstance } from "fastify";
import type { SpeechTokenProvider } from "../speech-token.ts";

export function registerSpeechTokenRoute(app: FastifyInstance, provider: SpeechTokenProvider | null): void {
  app.post("/api/speech-token", { bodyLimit: 1 }, async (request, reply) => {
    if (request.body !== undefined && request.body !== null && request.body !== "") {
      return reply.code(400).send({ error: { code: "BODY_NOT_ALLOWED" } });
    }
    if (!provider) return reply.code(503).send({ error: { code: "IDENTITY_UNAVAILABLE" } });
    try {
      reply.header("cache-control", "no-store");
      return await provider.getToken();
    } catch {
      return reply.code(503).send({ error: { code: "IDENTITY_UNAVAILABLE" } });
    }
  });
}
