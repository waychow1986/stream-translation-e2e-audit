declare global {
  interface Window {
    __TEST_PCM_FRAMES__?: number[][];
  }
}

export class AudioCapture {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private stopped = false;

  attachForTest(stream: MediaStream): void {
    this.stream = stream;
  }

  async start(send: (frame: ArrayBuffer) => void): Promise<void> {
    this.stopped = false;
    if (window.__TEST_PCM_FRAMES__) {
      for (const frame of window.__TEST_PCM_FRAMES__) {
        if (this.stopped) break;
        send(Uint8Array.from(frame).buffer);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext({ sampleRate: 16_000 });
    await this.context.audioWorklet.addModule(new URL("./audio-worklet.ts", import.meta.url));
    const source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, "pcm16-processor");
    this.node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => send(data);
    source.connect(this.node);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node?.disconnect();
    await this.context?.close();
    this.stream = undefined;
    this.node = undefined;
    this.context = undefined;
  }
}
