import { useEffect, useReducer, useRef, useState } from "react";
import { CaptionViewport } from "./CaptionViewport.tsx";
import { captionReducer, initialCaptionState } from "./caption-reducer.ts";
import { SessionController } from "./session-controller.ts";
import type { SpeechSession, SpeechSessionCallbacks } from "./speech-types.ts";

declare global {
  interface Window {
    __CAPTION_PROTOCOL_ADAPTER__?: {
      createSpeechSession(callbacks: SpeechSessionCallbacks): SpeechSession;
    };
  }
}

export function App() {
  const [state, dispatch] = useReducer(captionReducer, initialCaptionState);
  const [running, setRunning] = useState(false);
  const controller = useRef<SessionController | null>(null);
  useEffect(() => () => void controller.current?.stop(), []);

  async function start() {
    setRunning(true);
    const protocolAdapter = window.__CAPTION_PROTOCOL_ADAPTER__;
    controller.current = new SessionController(dispatch, {
      ...(protocolAdapter
        ? { createSpeechSession: (_endpoint, _token, callbacks) => protocolAdapter.createSpeechSession(callbacks) }
        : {}),
      onTerminated: () => setRunning(false)
    });
    try {
      await controller.current.start();
    } catch {
      setRunning(false);
      dispatch({ type: "clearCurrent" });
    }
  }

  async function stop() {
    await controller.current?.stop();
    controller.current = null;
    setRunning(false);
  }

  return (
    <main>
      <header>
        <h1>实时翻译字幕</h1>
        <button type="button" onClick={running ? stop : start}>
          {running ? "停止字幕" : "开始字幕"}
        </button>
      </header>
      <CaptionViewport state={state} />
    </main>
  );
}
