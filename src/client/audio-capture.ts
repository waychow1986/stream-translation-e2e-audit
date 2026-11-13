import workletUrl from "./audio-worklet.ts?worker&url";

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
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext({ sampleRate: 16_000 });
    await this.context.audioWorklet.addModule(workletUrl);
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
