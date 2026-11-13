import { access } from "node:fs/promises";
import type { Writable } from "node:stream";

import fastifyStatic from "@fastify/static";
import {
  createErrorEnvelope,
  type ErrorCode,
} from "@stream-translation/contracts";
import Fastify, {
  type FastifyInstance,
  type FastifyLoggerOptions,
  type FastifyRequest,
} from "fastify";

import {
  loadConfig,
  type ConfigResult,
  type Environment,
} from "./config.js";
import { loggerOptions, logConfigurationFailure } from "./logging.js";
import { registerHealthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  environment?: Environment;
  staticRoot: string;
  logStream?: Writable;
}

function apiError(
  request: Pick<FastifyRequest, "id">,
  code: ErrorCode,
): ReturnType<typeof createErrorEnvelope> {
  return createErrorEnvelope(code, "configuration", request.id);
}

function securityPolicy(configResult: ConfigResult): string {
  const connectSources = ["'self'"];
  if (configResult.ready) {
    connectSources.push(
      configResult.config.foundryEndpoint,
      `https://${configResult.config.speechRegion}.api.cognitive.microsoft.com`,
      `wss://${configResult.config.speechRegion}.stt.speech.microsoft.com`,
    );
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; ");
}

async function staticAssetsReady(staticRoot: string): Promise<boolean> {
  try {
    await access(`${staticRoot}/index.html`);
    return true;
  } catch {
    return false;
  }
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const environment = options.environment ?? process.env;
  const configResult = loadConfig(environment);
  const hasStaticAssets = await staticAssetsReady(options.staticRoot);
  const app: FastifyInstance = options.logStream
    ? Fastify({
        logger: {
          ...loggerOptions,
          stream: options.logStream,
        } as unknown as FastifyLoggerOptions,
      })
    : Fastify({ logger: false });
  const csp = securityPolicy(configResult);

  if (!configResult.ready && options.logStream) {
    logConfigurationFailure(app.log, configResult.issues);
  }

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    const expectedOrigin = configResult.ready
      ? configResult.config.publicOrigin
      : undefined;
    if (!expectedOrigin || request.headers.origin !== expectedOrigin) {
      return reply
        .code(403)
        .send(apiError(request, "ORIGIN_REJECTED"));
    }

    const mediaType = request.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim();
    if (request.method !== "GET" && mediaType !== "application/json") {
      return reply
        .code(415)
        .send(apiError(request, "INVALID_REQUEST"));
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Content-Security-Policy", csp);
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    return payload;
  });

  await registerHealthRoutes(app, {
    isReady: () => configResult.ready && hasStaticAssets,
    environment,
  });

  if (hasStaticAssets) {
    await app.register(fastifyStatic, {
      root: options.staticRoot,
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send(apiError(request, "INVALID_REQUEST"));
    }
    return reply.code(404).send({ status: "not-found" });
  });

  app.setErrorHandler(async (_error, request, reply) =>
    reply.code(400).send(apiError(request, "INVALID_REQUEST")),
  );

  return app;
}
