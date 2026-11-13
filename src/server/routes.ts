import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";

export function registerRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/candidate-identity", async () => ({
    deliveryId: config.deliveryId,
    candidateSha: config.candidateSha
  }));
}
