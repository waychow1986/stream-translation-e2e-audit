import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("approved stack and clean validation scripts are locked", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const expected: Record<string, string> = {
    typescript: "5.9.3",
    react: "19.2.0",
    vite: "7.2.2",
    fastify: "5.6.2",
    "microsoft-cognitiveservices-speech-sdk": "1.53.0",
    "@azure/identity": "4.13.0",
    openai: "7.2.0",
    "@playwright/test": "1.56.1"
  };
  for (const [name, version] of Object.entries(expected)) {
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  for (const script of ["staticAnalysis", "build", "developerTests", "integrationTests", "functionalTests"]) {
    assert.match(packageJson.scripts[script], /clean/);
  }
  assert.match(packageJson.engines.node, /^22/);
});
