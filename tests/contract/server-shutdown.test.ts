import assert from "node:assert/strict";
import test from "node:test";
import { InFlightTranslations } from "../../src/server/routes/translations.ts";

test("shutdown rejects new work and cancels all in-flight translations", () => {
  const registry = new InFlightTranslations();
  const controller = registry.begin();
  registry.shutdown();
  assert.equal(controller.signal.aborted, true);
  assert.throws(() => registry.begin(), /shutting down/);
});
