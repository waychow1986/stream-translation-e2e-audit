import assert from "node:assert/strict";
import test from "node:test";
import { SessionResources } from "../../src/client/session-controller.ts";

test("stopping a session disposes recognition, timers and requests exactly once", async () => {
  const events: string[] = [];
  const resources = new SessionResources();
  resources.add(() => events.push("request"));
  resources.add(() => events.push("timer"));
  resources.add(async () => events.push("recognizer"));
  await resources.dispose();
  await resources.dispose();
  assert.deepEqual(events, ["recognizer", "timer", "request"]);
});
