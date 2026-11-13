import websocket from "@fastify/websocket";
import { Value } from "@sinclair/typebox/value";
import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";
import { clientMessageSchema } from "../shared/protocol.js";
import type { ServerEvent } from "../shared/types.js";
import type { WebSocket } from "ws";
import { createAzureFoundryTranslator } from "./adapters/azure-foundry.js";
import { AzureSpeechAdapter } from "./adapters/azure-speech.js";
import { deterministicAdapters } from "./adapters/deterministic.js";
import type { AppConfig } from "./config.js";
import { isAllowedOrigin } from "./security.js";
import { TranslationSession, type SessionAdapters } from "./translation-session.js";

export type SessionAdapterFactory = () => SessionAdapters;

function adapters(config: AppConfig): SessionAdapters {
  return config.adapterMode === "deterministic"
    ? deterministicAdapters()
    : {
        speech: new AzureSpeechAdapter(config),
        translator: createAzureFoundryTranslator(config)
      };
}

export async function registerTranslationWebSocket(
  app: FastifyInstance,
  config: AppConfig,
  adapterFactory: SessionAdapterFactory = () => adapters(config)
): Promise<void> {
  const active = new Map<WebSocket, TranslationSession>();
  let accepting = true;
  await app.register(websocket);
  app.get("/ws/translation", { websocket: true }, (socket, request) => {
    if (!accepting) {
      socket.close(1012, "Server shutting down");
      return;
    }
    if (!isAllowedOrigin(request.headers.origin, request.headers.host)) {
      socket.close(1008, "Origin rejected");
      return;
    }
    const send = (event: ServerEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    const session = new TranslationSession(adapterFactory(), send);
    active.set(socket, session);
    const release = async () => {
      await session.fail("INTERNAL_ERROR");
      active.delete(socket);
    };
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
    socket.on("close", () => void release());
    socket.on("error", () => void release());
  });
  app.addHook("onClose", async () => {
    accepting = false;
    const connections = [...active.entries()];
    await Promise.all(connections.map(([, session]) => session.fail("INTERNAL_ERROR")));
    for (const [socket] of connections) socket.close(1012, "Server shutting down");
    active.clear();
  });
}
