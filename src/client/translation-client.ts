import type { ServerEvent } from "../shared/types.js";
import { AudioCapture } from "./audio-capture.js";

interface Capture {
  start(send: (frame: ArrayBuffer) => void): Promise<void>;
  stop(): Promise<void>;
}

interface ClientSocket {
  readonly OPEN: number;
  readyState: number;
  binaryType: BinaryType;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void | Promise<void>) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export class TranslationClient {
  private socket?: ClientSocket;
  private readonly capture: Capture;
  private readonly createSocket: (url: string) => ClientSocket;
  private readonly webSocketUrl?: string;
  private cleanupPromise?: Promise<void>;
  private terminalEventReceived = false;

  constructor(
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onStatus: (status: string) => void,
    dependencies: {
      capture?: Capture;
      createSocket?: (url: string) => ClientSocket;
      webSocketUrl?: string;
    } = {}
  ) {
    this.capture = dependencies.capture ?? new AudioCapture();
    this.createSocket = dependencies.createSocket ?? ((url) => new WebSocket(url) as ClientSocket);
    this.webSocketUrl = dependencies.webSocketUrl;
  }

  async start(): Promise<void> {
    this.cleanupPromise = undefined;
    this.terminalEventReceived = false;
    this.onStatus("正在启动");
    const protocol = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
    const url = this.webSocketUrl ?? `${protocol}//${location.host}/ws/translation`;
    this.socket = this.createSocket(url);
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
        this.terminalEventReceived = true;
        this.onStatus("已停止");
      } else if (event.type === "session.failed") {
        this.terminalEventReceived = true;
        await this.cleanupCapture();
        this.onStatus("本次会话已结束");
      }
    };
    this.socket.onclose = () => void this.handleConnectionEnd();
    await new Promise<void>((resolve, reject) => {
      this.socket!.onopen = () => {
        this.socket!.send(JSON.stringify({
          type: "start",
          protocolVersion: 1,
          audio: { encoding: "pcm_s16le", sampleRate: 16_000, channels: 1 }
        }));
        resolve();
      };
      this.socket!.onerror = () => {
        void this.handleConnectionEnd();
        reject(new Error("WebSocket connection failed"));
      };
    });
  }

  async stop(): Promise<void> {
    await this.cleanupCapture();
    const socket = this.socket;
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanupCapture();
    this.socket?.close();
  }

  private cleanupCapture(): Promise<void> {
    this.cleanupPromise ??= this.capture.stop();
    return this.cleanupPromise;
  }

  private async handleConnectionEnd(): Promise<void> {
    await this.cleanupCapture();
    if (!this.terminalEventReceived) this.onStatus("本次会话已结束");
  }
}
