import { useEffect, useRef, useState } from "react";
import type { ServerEvent, SubtitleSegment } from "../shared/types.js";
import { subtitleReducer } from "./subtitle-reducer.js";
import { TranslationClient } from "./translation-client.js";
import "./styles.css";

export function App() {
  const [status, setStatus] = useState("尚未开始");
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const client = useRef<TranslationClient | undefined>(undefined);

  useEffect(() => () => { void client.current?.disconnect(); }, []);

  function handleEvent(event: ServerEvent): void {
    if (event.type === "subtitle.delta" || event.type === "subtitle.final") {
      setSubtitles((current) => subtitleReducer(current, event));
    } else if (event.type === "speech.final") {
      setDetectedLanguage(event.detectedLanguage);
    } else if (event.type === "dependency.evidence") {
      setEvidence((current) => [...current, `${event.speechResultId}/${event.modelRequestId}`]);
    }
  }

  async function start(): Promise<void> {
    setSubtitles([]);
    setEvidence([]);
    const next = new TranslationClient(handleEvent, setStatus);
    client.current = next;
    await next.start();
  }

  return (
    <main>
      <h1>实时中文字幕</h1>
      <p data-testid="status" className="status">{status}</p>
      <div className="controls">
        <button disabled={status === "正在启动" || status === "正在聆听"} onClick={() => void start()}>
          开始翻译
        </button>
        <button disabled={status !== "正在聆听"} onClick={() => void client.current?.stop()}>
          停止翻译
        </button>
      </div>
      <p className="language">自动检测语言：<span data-testid="detected-language">{detectedLanguage || "等待语音"}</span></p>
      <section aria-live="polite" aria-label="中文字幕" lang="zh-CN">
        {subtitles.map((subtitle) => (
          <p data-testid="subtitle" key={subtitle.segmentId}>{subtitle.text}</p>
        ))}
      </section>
      <output data-testid="evidence" hidden>{evidence.join(",")}</output>
      <output data-testid="acceptance" data-complete={evidence.length > 0 && evidence.every((item) => !item.includes("test-double:"))} hidden />
    </main>
  );
}
