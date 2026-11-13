import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("deployment artifacts define the production port, identity and numeric user", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");
  const deployment = JSON.parse(await readFile(".ai-delivery/features/003-v1/runtime/deployment.json", "utf8"));
  assert.match(dockerfile, /^USER 10001$/m);
  assert.equal(deployment.containerPort, 8080);
  assert.equal(deployment.healthPath, "/healthz");
  assert.equal(deployment.candidateIdentityPath, "/candidate-identity");
  assert.equal(deployment.requiresPrivateNetwork, false);
  assert.equal(deployment.postgresql, null);
});
