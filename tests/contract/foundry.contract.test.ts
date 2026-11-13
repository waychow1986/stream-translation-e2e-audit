import { describe, expect, it } from "vitest";
import { FOUNDRY_SYSTEM_INSTRUCTION, FoundryTranslator } from "../../src/server/adapters/foundry.js";

describe("Foundry translation contract", () => {
  it("uses fixed Chinese instruction, streaming, no reasoning and request evidence", async () => {
    const requests: unknown[] = [];
    const translator = new FoundryTranslator(async (request, onDelta) => {
      requests.push(request);
      onDelta("你");
      onDelta("好");
      return { requestId: "request-1" };
    });
    const deltas: string[] = [];
    const output = await translator.translate("hello", new AbortController().signal, (delta) => deltas.push(delta));
    expect(requests[0]).toMatchObject({
      stream: true,
      reasoning_effort: "none",
      system: FOUNDRY_SYSTEM_INSTRUCTION
    });
    expect(deltas).toEqual(["你", "好"]);
    expect(output).toEqual({ requestId: "request-1" });
  });
});
