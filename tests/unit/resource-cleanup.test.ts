import { describe, expect, it, vi } from "vitest";
import { AudioCapture } from "../../src/client/audio-capture.js";

describe("client resource cleanup", () => {
  it("stops every media track idempotently", async () => {
    const stop = vi.fn();
    const capture = new AudioCapture();
    capture.attachForTest({ getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream);
    await capture.stop();
    await capture.stop();
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
