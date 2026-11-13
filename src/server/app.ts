import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./config.js";
import { registerRoutes } from "./routes.js";
import { securityHeaders } from "./security.js";
import { registerTranslationWebSocket } from "./websocket.js";

export async function buildApp(
  config: AppConfig,
  options: { registerWebSocket?: boolean } = {}
): Promise<FastifyInstance> {
  const app = fastify({ logger: false, bodyLimit: 16_384 });
  app.addHook("onSend", async (_request, reply) => {
    for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
  });
  registerRoutes(app, config);
  if (options.registerWebSocket !== false) await registerTranslationWebSocket(app, config);
  const publicRoot = resolve("dist/public");
  if (existsSync(publicRoot)) {
    await app.register(fastifyStatic, { root: publicRoot, wildcard: false });
    app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }
  return app;
}
