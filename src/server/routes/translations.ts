import type { FastifyInstance } from "fastify";
import type { FoundryTranslator } from "../foundry-adapter.ts";
import { parseTranslationRequest, ValidationError } from "../../shared/schemas.ts";

export class InFlightTranslations {
  private accepting = true;
  private readonly controllers = new Set<AbortController>();

  begin(): AbortController {
    if (!this.accepting) throw new Error("server is shutting down");
    if (this.controllers.size >= 32) throw new Error("capacity exceeded");
    const controller = new AbortController();
    this.controllers.add(controller);
    return controller;
  }

  end(controller: AbortController): void {
    this.controllers.delete(controller);
  }

  shutdown(): void {
    this.accepting = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}

export function registerTranslationRoute(app: FastifyInstance, translator: FoundryTranslator | null, registry: InFlightTranslations): void {
  app.post("/api/translations", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    let parsed;
    try {
      parsed = parseTranslationRequest(request.body);
    } catch (error) {
      const status = error instanceof ValidationError ? error.statusCode : 400;
      return reply.code(status).send({ error: { code: status === 413 ? "TEXT_TOO_LARGE" : "INVALID_REQUEST" } });
    }
    if (!translator) return reply.code(503).send({ error: { code: "DEPENDENCY_FAILED" } });
    let controller: AbortController;
    try {
      controller = registry.begin();
    } catch {
      return reply.code(429).send({ error: { code: "TOO_MANY_REQUESTS" } });
    }
    request.raw.once("aborted", () => controller.abort());
    reply.raw.once("close", () => {
      if (!reply.raw.writableEnded) controller.abort();
    });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    let completed = "";
    try {
      for await (const delta of translator.translate(parsed.text, controller.signal)) {
        completed += delta;
        reply.raw.write(`${JSON.stringify({ type: "delta", text: delta })}\n`);
      }
      reply.raw.write(`${JSON.stringify({ type: "completed", text: completed })}\n`);
    } catch {
      const code = controller.signal.aborted ? "CANCELLED" : "DEPENDENCY_FAILED";
      reply.raw.write(`${JSON.stringify({ type: "error", code })}\n`);
    } finally {
      registry.end(controller);
      reply.raw.end();
    }
  });
}
