import type { ServerEvent } from "../shared/types.js";
import { AudioCapture } from "./audio-capture.js";

export class TranslationClient {
  private socket?: WebSocket;
  private readonly capture = new AudioCapture();

  constructor(
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onStatus: (status: string) => void
  ) {}

  async start(): Promise<void> {
    this.onStatus("正在启动");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${location.host}/ws/translation`);
    this.socket.binaryType = "arraybuffer";
    this.socket.onmessage = async ({ data }) => {
      const event = JSON.parse(String(data)) as ServerEvent;
      this.onEvent(event);
      if (event.type === "session.started") {
        this.onStatus("正在聆听");
        await this.capture.start((frame) => {
          if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame);
        });
      } else if (event.type === "session.stopped") {
        this.onStatus("已停止");
      } else if (event.type === "session.failed") {
        await this.capture.stop();
        this.onStatus("本次会话已结束");
      }
    };
    await new Promise<void>((resolve, reject) => {
      this.socket!.onopen = () => {
        this.socket!.send(JSON.stringify({
          type: "start",
          protocolVersion: 1,
          audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
        }));
        resolve();
      };
      this.socket!.onerror = () => reject(new Error("WebSocket connection failed"));
    });
  }

  async stop(): Promise<void> {
    await this.capture.stop();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
  }

  async disconnect(): Promise<void> {
    await this.capture.stop();
    this.socket?.close();
  }
}
