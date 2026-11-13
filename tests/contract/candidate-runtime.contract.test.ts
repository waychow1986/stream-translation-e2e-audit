import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("candidate runtime contract", () => {
  it("uses the approved port and numeric non-root UID", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toMatch(/^USER 10001$/m);
    expect(dockerfile).toMatch(/^EXPOSE 3000$/m);
  });

  it("declares exact health and identity paths", async () => {
    const deployment = JSON.parse(await readFile(
      ".ai-delivery/features/002-v1/runtime/deployment.json",
      "utf8"
    )) as Record<string, unknown>;
    expect(deployment).toMatchObject({
      containerPort: 3000,
      healthPath: "/healthz",
      candidateIdentityPath: "/candidate-identity",
      requiresPrivateNetwork: false
    });
  });
});
