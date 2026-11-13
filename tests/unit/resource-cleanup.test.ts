import { describe, expect, it, vi } from "vitest";
import { AudioCapture } from "../../src/client/audio-capture.js";
import { TranslationClient } from "../../src/client/translation-client.js";

describe("client resource cleanup", () => {
  it("stops every media track idempotently", async () => {
    const stop = vi.fn();
    const capture = new AudioCapture();
    capture.attachForTest({ getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream);
    await capture.stop();
    await capture.stop();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it.each(["close", "error"] as const)("stops browser capture when the WebSocket emits %s", async (eventName) => {
    const capture = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const socket = {
      OPEN: 1,
      readyState: 0,
      binaryType: "blob" as BinaryType,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((event: { data: unknown }) => void | Promise<void>) | null,
      onclose: null as (() => void) | null,
      onerror: null as (() => void) | null
    };
    const client = new TranslationClient(vi.fn(), vi.fn(), {
      capture,
      createSocket: () => socket,
      webSocketUrl: "ws://example.test/ws/translation"
    });

    const started = client.start();
    socket.readyState = socket.OPEN;
    socket.onopen?.();
    await started;
    await socket.onmessage?.({ data: JSON.stringify({
      type: "session.started",
      protocolVersion: 1,
      sessionId: "session-1"
    }) });

    socket[`on${eventName}`]?.();
    await vi.waitFor(() => expect(capture.stop).toHaveBeenCalledTimes(1));
    await client.disconnect();
    expect(capture.stop).toHaveBeenCalledTimes(1);
  });
});
