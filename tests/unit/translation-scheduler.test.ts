import assert from "node:assert/strict";
import test from "node:test";
import { TranslationScheduler } from "../../src/client/translation-scheduler.ts";

test("scheduler uses 400ms silence, 2s maximum and latest-wins cancellation", () => {
  const calls: string[] = [];
  let now = 0;
  const timers: Array<() => void> = [];
  const scheduler = new TranslationScheduler(
    (text) => calls.push(text),
    { now: () => now, setTimeout: (callback) => (timers.push(callback), timers.length), clearTimeout: () => undefined }
  );
  scheduler.update("hello");
  scheduler.update("hello world");
  timers.at(-1)?.();
  assert.deepEqual(calls, ["hello world"]);
  now = 2_100;
  scheduler.update("hello world again");
  assert.deepEqual(calls, ["hello world", "hello world again"]);
  scheduler.dispose();
});
