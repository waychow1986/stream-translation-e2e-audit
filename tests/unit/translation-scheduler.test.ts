import assert from "node:assert/strict";
import test from "node:test";
import { TranslationScheduler } from "../../src/client/translation-scheduler.ts";

class FakeClock {
  nowValue = 0;
  nextId = 1;
  timers = new Map<number, { at: number; callback: () => void }>();

  now = () => this.nowValue;
  setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.nowValue + delay, callback });
    return id;
  };
  clearTimeout = (id: number) => {
    this.timers.delete(id);
  };
  advance(ms: number) {
    const target = this.nowValue + ms;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!next) break;
      this.nowValue = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.nowValue = target;
  }
}

test("scheduler submits only a changed snapshot containing a complete token after 400ms", () => {
  const calls: string[] = [];
  const clock = new FakeClock();
  const scheduler = new TranslationScheduler((text) => calls.push(text), clock);

  scheduler.update("hel");
  clock.advance(500);
  assert.deepEqual(calls, []);

  scheduler.update("hello ");
  scheduler.update("hello ");
  clock.advance(399);
  assert.deepEqual(calls, []);
  clock.advance(1);
  assert.deepEqual(calls, ["hello"]);

  scheduler.update("hello w");
  clock.advance(500);
  assert.deepEqual(calls, ["hello"]);

  scheduler.update("hello world.");
  clock.advance(400);
  assert.deepEqual(calls, ["hello", "hello world."]);
  scheduler.dispose();
});

test("scheduler emits the latest changing snapshot at the two second boundary", () => {
  const calls: string[] = [];
  const clock = new FakeClock();
  const scheduler = new TranslationScheduler((text) => calls.push(text), clock);

  scheduler.update("h");
  for (const text of ["he", "hel", "hell", "hello"]) {
    clock.advance(400);
    scheduler.update(text);
  }
  clock.advance(400);

  assert.deepEqual(calls, ["hello"]);
  scheduler.update("hello");
  clock.advance(2_000);
  assert.deepEqual(calls, ["hello"]);
});
