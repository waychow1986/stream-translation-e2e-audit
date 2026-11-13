import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig } from "./config.ts";
import type { SpeechTokenProvider } from "./speech-token.ts";
import type { FoundryTranslator } from "./foundry-adapter.ts";
import { installSecurity } from "./security.ts";
import { registerConfigRoute } from "./routes/config.ts";
import { registerSpeechTokenRoute } from "./routes/speech-token.ts";
import { InFlightTranslations, registerTranslationRoute } from "./routes/translations.ts";

interface AppDependencies {
  config: AppConfig;
  tokenProvider: SpeechTokenProvider | null;
  translator: FoundryTranslator | null;
}

const translationRegistries = new WeakMap<FastifyInstance, InFlightTranslations>();

export function prepareAppShutdown(app: FastifyInstance): void {
  translationRegistries.get(app)?.shutdown();
}

export async function buildApp({ config, tokenProvider, translator }: AppDependencies) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  installSecurity(app, config.speechEndpoint);
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/candidate-identity", async () => ({ deliveryId: config.deliveryId, candidateSha: config.candidateSha }));
  registerConfigRoute(app, config);
  registerSpeechTokenRoute(app, tokenProvider);
  const registry = new InFlightTranslations();
  translationRegistries.set(app, registry);
  registerTranslationRoute(app, translator, registry);
  app.addHook("onClose", async () => registry.shutdown());
  const clientRoot = resolve("dist/client");
  if (existsSync(clientRoot)) {
    await app.register(fastifyStatic, { root: clientRoot, index: false });
    app.get("/", async (_request, reply) => reply.sendFile("index.html"));
  }
  return app;
}
