import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config.js";
import type { SessionAdapters } from "../../src/server/translation-session.js";

describe("server resource cleanup", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("cancels Speech and the active model stream on an actual WebSocket disconnect", async () => {
    const cancelled = vi.fn(async () => {});
    const modelReleased = vi.fn();
    const adapters: SessionAdapters[] = [];
    const app = await buildApp(testConfig(), {
      adapterFactory: () => {
        const current: SessionAdapters = {
          speech: {
            async start(onSegment) {
              onSegment?.({
                segmentId: 1,
                detectedLanguage: "en-US",
                text: "hello",
                isFinal: true,
                speechResultId: "speech-1"
              });
            },
            push() {},
            async stop() {},
            cancel: cancelled
          },
          translator: {
            translate: (_text, signal) => new Promise((_, reject) => {
              signal.addEventListener("abort", () => {
                modelReleased();
                reject(new Error("cancelled"));
              }, { once: true });
            })
          }
        };
        adapters.push(current);
        return current;
      }
    });
    apps.push(app);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(address.replace("http", "ws") + "/ws/translation", {
      headers: { Origin: address }
    });
    await once(socket, "open");
    socket.send(JSON.stringify({
      type: "start",
      protocolVersion: 1,
      audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
    }));
    await once(socket, "message");
    socket.close();
    await once(socket, "close");

    await vi.waitFor(() => {
      expect(cancelled).toHaveBeenCalledOnce();
      expect(modelReleased).toHaveBeenCalledOnce();
    });

    const replacement = new WebSocket(address.replace("http", "ws") + "/ws/translation", {
      headers: { Origin: address }
    });
    await once(replacement, "open");
    replacement.close();
    await once(replacement, "close");
    expect(adapters).toHaveLength(2);
  });

  it("releases the WebSocket after a normal stop", async () => {
    const app = await buildApp(testConfig());
    apps.push(app);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const socket = new WebSocket(address.replace("http", "ws") + "/ws/translation", {
      headers: { Origin: address }
    });
    await once(socket, "open");
    socket.send(JSON.stringify({
      type: "start",
      protocolVersion: 1,
      audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
    }));
    await once(socket, "message");
    socket.send(JSON.stringify({ type: "stop" }));
    const [data] = await once(socket, "message");
    expect(JSON.parse(data.toString())).toEqual({ type: "session.stopped" });
    const [code] = await once(socket, "close");
    expect(code).toBe(1000);
  });

  it("drives SIGTERM and closes an active WebSocket before the process exits", async () => {
    const port = await availablePort();
    const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...testEnvironment(port),
        NODE_ENV: "test",
        APP_ADAPTER_MODE: "deterministic"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    await vi.waitFor(() => expect(output).toContain("application.ready"), { timeout: 10_000 });

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/translation`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    await once(socket, "open");
    socket.send(JSON.stringify({
      type: "start",
      protocolVersion: 1,
      audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
    }));
    await once(socket, "message");

    child.kill("SIGTERM");
    await once(socket, "close");
    const [exitCode, signal] = await once(child, "exit");
    expect({ exitCode, signal }).toEqual({ exitCode: 0, signal: null });
  });
});

function testConfig(): AppConfig {
  return {
    nodeEnv: "test",
    port: 3000,
    deliveryId: "delivery",
    candidateSha: "candidate",
    azureClientId: "client",
    speechEndpoint: "https://speech.example.test",
    speechResourceId: "/subscriptions/s/resourceGroups/r/providers/Microsoft.CognitiveServices/accounts/a",
    foundryProjectEndpoint: "https://foundry.example.test",
    modelDeployment: "deployment",
    adapterMode: "deterministic"
  };
}

function testEnvironment(port: number): NodeJS.ProcessEnv {
  const config = testConfig();
  return {
    PORT: String(port),
    AIDELIVERY_DELIVERY_ID: config.deliveryId,
    AIDELIVERY_CANDIDATE_SHA: config.candidateSha,
    AZURE_CLIENT_ID: config.azureClientId,
    AZURE_SPEECH_ENDPOINT: config.speechEndpoint,
    AZURE_SPEECH_RESOURCE_ID: config.speechResourceId,
    AZURE_AI_PROJECT_ENDPOINT: config.foundryProjectEndpoint,
    AZURE_AI_MODEL_DEPLOYMENT_NAME: config.modelDeployment
  };
}

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
