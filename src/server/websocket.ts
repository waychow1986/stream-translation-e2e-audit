import websocket from "@fastify/websocket";
import { Value } from "@sinclair/typebox/value";
import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";
import { clientMessageSchema } from "../shared/protocol.js";
import type { ServerEvent } from "../shared/types.js";
import { createAzureFoundryTranslator } from "./adapters/azure-foundry.js";
import { AzureSpeechAdapter } from "./adapters/azure-speech.js";
import { deterministicAdapters } from "./adapters/deterministic.js";
import type { AppConfig } from "./config.js";
import { isAllowedOrigin } from "./security.js";
import { TranslationSession, type SessionAdapters } from "./translation-session.js";

function adapters(config: AppConfig): SessionAdapters {
  return config.adapterMode === "deterministic"
    ? deterministicAdapters()
    : {
        speech: new AzureSpeechAdapter(config),
        translator: createAzureFoundryTranslator(config)
      };
}

export async function registerTranslationWebSocket(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(websocket);
  app.get("/ws/translation", { websocket: true }, (socket, request) => {
    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      socket.close(1008, "Origin rejected");
      return;
    }
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    const session = new TranslationSession(adapters(config), send);
    socket.on("message", async (data: RawData, isBinary: boolean) => {
      try {
        if (isBinary) {
          session.pushAudio(Buffer.from(data as Buffer));
          return;
        }
        const message = JSON.parse(data.toString()) as unknown;
        if (!Value.Check(clientMessageSchema, message)) throw new Error("Protocol error");
        if (message.type === "start") await session.start();
        else await session.stop();
      } catch {
        await session.fail("PROTOCOL_ERROR");
      }
    });
    socket.on("close", () => void session.fail("INTERNAL_ERROR"));
    socket.on("error", () => void session.fail("INTERNAL_ERROR"));
  });
}
