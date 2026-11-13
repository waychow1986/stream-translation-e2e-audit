import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.ts";

export function registerConfigRoute(app: FastifyInstance, config: AppConfig): void {
  app.get("/api/config", async () => ({
    speechEndpoint: config.speechEndpoint,
    candidateLanguages: ["en-US", "zh-CN"]
  }));
}
