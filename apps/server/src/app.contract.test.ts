import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { Environment } from "./config.js";

const validEnvironment: Environment = {
  PORT: "8080",
  PUBLIC_ORIGIN: "https://translation.example",
  SPEECH_REGION: "eastus",
  SPEECH_KEY: "test-only-speech-secret",
  SPEECH_SOURCE_LANGUAGES_JSON:
    '[{"tag":"en-US","displayNameZh":"英语（美国）","enabled":true}]',
  SPEECH_CATALOG_VERSION: "catalog-1",
  AZURE_FOUNDRY_ENDPOINT: "https://foundry.example",
  AZURE_FOUNDRY_DEPLOYMENT: "gpt-sol-6.1",
  AIDELIVERY_DELIVERY_ID: "DLV-test",
  AIDELIVERY_CANDIDATE_SHA: "candidate-test",
};

let staticRoot: string;

beforeEach(async () => {
  staticRoot = await mkdtemp(join(tmpdir(), "stream-translation-static-"));
  await writeFile(
    join(staticRoot, "index.html"),
    "<!doctype html><title>实时翻译</title><div id=\"root\"></div>",
  );
});

afterEach(async () => {
  await rm(staticRoot, { recursive: true, force: true });
});

describe("Fastify foundational contract", () => {
  it("serves the SPA with strict browser security headers", async () => {
    const app = await buildApp({ environment: validEnvironment, staticRoot });

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("实时翻译");
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );
    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });

  it("keeps live independent and reports invalid configuration as not ready", async () => {
    const app = await buildApp({
      environment: { ...validEnvironment, AZURE_FOUNDRY_DEPLOYMENT: "wrong" },
      staticRoot,
    });

    const live = await app.inject({ method: "GET", url: "/health/live" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "live" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "not-ready" });
    await app.close();
  });

  it("does not claim readiness when static assets are unavailable", async () => {
    const app = await buildApp({
      environment: validEnvironment,
      staticRoot: join(staticRoot, "missing"),
    });

    const ready = await app.inject({ method: "GET", url: "/health/ready" });

    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "not-ready" });
    await app.close();
  });

  it("rejects cross-origin and invalid content type before API routing", async () => {
    const app = await buildApp({ environment: validEnvironment, staticRoot });

    const crossOrigin = await app.inject({
      method: "POST",
      url: "/api/not-found",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      payload: {},
    });
    const missingOrigin = await app.inject({
      method: "POST",
      url: "/api/not-found",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    const wrongContentType = await app.inject({
      method: "POST",
      url: "/api/not-found",
      headers: {
        origin: "https://translation.example",
        "content-type": "text/plain",
      },
      payload: "text",
    });

    expect(crossOrigin.statusCode).toBe(403);
    expect(crossOrigin.json().error.code).toBe("ORIGIN_REJECTED");
    expect(missingOrigin.statusCode).toBe(403);
    expect(wrongContentType.statusCode).toBe(415);
    expect(wrongContentType.json().error.code).toBe("INVALID_REQUEST");
    await app.close();
  });

  it("returns candidate identity only from platform environment values", async () => {
    const app = await buildApp({ environment: validEnvironment, staticRoot });
    const identity = await app.inject({
      method: "GET",
      url: "/candidate-identity",
    });

    expect(identity.statusCode).toBe(200);
    expect(identity.json()).toEqual({
      deliveryId: "DLV-test",
      candidateSha: "candidate-test",
    });
    await app.close();

    const appWithoutIdentity = await buildApp({
      environment: {
        ...validEnvironment,
        AIDELIVERY_DELIVERY_ID: undefined,
        AIDELIVERY_CANDIDATE_SHA: undefined,
      },
      staticRoot,
    });
    const unavailable = await appWithoutIdentity.inject({
      method: "GET",
      url: "/candidate-identity",
    });
    expect(unavailable.statusCode).toBe(503);
    await appWithoutIdentity.close();
  });

  it("does not log request content, credentials, tokens, or stack traces", async () => {
    let logs = "";
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    });
    const app = await buildApp({
      environment: validEnvironment,
      staticRoot,
      logStream,
    });

    await app.inject({
      method: "POST",
      url: "/api/not-found",
      headers: {
        origin: "https://translation.example",
        "content-type": "application/json",
        authorization: "******",
      },
      payload: {
        transcript: "forbidden-transcript",
        subtitle: "forbidden-subtitle",
        token: "forbidden-token",
      },
    });
    await app.close();

    expect(logs).not.toMatch(
      /forbidden-|test-only-speech-secret|transcript|subtitle|authorization|stack/i,
    );
  });
});
