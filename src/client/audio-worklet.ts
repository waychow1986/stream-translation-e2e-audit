declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class Pcm16Processor extends AudioWorkletProcessor {
  private readonly output: number[] = [];

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      const clamped = Math.max(-1, Math.min(1, sample));
      this.output.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    }
    if (this.output.length >= 320) {
      const pcm = new Int16Array(this.output.splice(0, 320));
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm16-processor", Pcm16Processor);
