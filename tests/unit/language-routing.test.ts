import assert from "node:assert/strict";
import test from "node:test";
import { routeRecognition } from "../../src/client/session-controller.ts";

test("Chinese bypasses translation and unknown language terminates current work", () => {
  assert.equal(routeRecognition("zh-CN"), "display");
  assert.equal(routeRecognition("en-US"), "translate");
  assert.equal(routeRecognition("fr-FR"), "reject");
});
