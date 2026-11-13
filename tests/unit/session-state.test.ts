import { describe, expect, it } from "vitest";
import { SessionLifecycle } from "../../src/server/translation-session.js";

describe("session lifecycle", () => {
  it("follows the approved lifecycle and rejects audio after stop", () => {
    const session = new SessionLifecycle();
    session.start();
    session.started();
    expect(session.acceptAudio()).toBe(true);
    session.stop();
    expect(session.state).toBe("draining");
    expect(session.acceptAudio()).toBe(false);
    session.stopped();
    expect(session.canEmitBusinessEvent()).toBe(false);
  });

  it("makes failure terminal", () => {
    const session = new SessionLifecycle();
    session.start();
    session.fail();
    expect(session.state).toBe("failed");
    expect(() => session.started()).toThrow();
  });
});
