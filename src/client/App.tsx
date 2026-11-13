import { useEffect, useReducer, useRef, useState } from "react";
import { CaptionViewport } from "./CaptionViewport.tsx";
import { captionReducer, initialCaptionState } from "./caption-reducer.ts";
import { SessionController } from "./session-controller.ts";

declare global {
  interface Window {
    __CAPTION_TEST_SCENARIO__?: "english" | "chinese" | "many";
  }
}

export function App() {
  const [state, dispatch] = useReducer(captionReducer, initialCaptionState);
  const [running, setRunning] = useState(false);
  const controller = useRef<SessionController | null>(null);
  useEffect(() => () => void controller.current?.stop(), []);

  async function start() {
    setRunning(true);
    if (window.__CAPTION_TEST_SCENARIO__) {
      runTestScenario(window.__CAPTION_TEST_SCENARIO__, dispatch);
      return;
    }
    controller.current = new SessionController(dispatch);
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

function runTestScenario(scenario: "english" | "chinese" | "many", dispatch: React.Dispatch<Parameters<typeof captionReducer>[1]>) {
  if (scenario === "english") {
    dispatch({ type: "recognizing", segmentId: "1", language: "en-US", sourceText: "hello", revision: 1 });
    dispatch({ type: "translationStarted", segmentId: "1", revision: 1, requestId: "draft", final: false, sourceText: "hello" });
    dispatch({ type: "translationDelta", segmentId: "1", revision: 1, requestId: "draft", text: "你好", first: true });
    window.setTimeout(() => {
      dispatch({ type: "translationStarted", segmentId: "1", revision: 2, requestId: "final", final: true, sourceText: "hello world" });
      dispatch({ type: "translationDelta", segmentId: "1", revision: 2, requestId: "final", text: "你好世界", first: true });
      dispatch({ type: "translationCompleted", segmentId: "1", revision: 2, requestId: "final" });
    }, 50);
    return;
  }
  const count = scenario === "many" ? 12 : 1;
  for (let index = 1; index <= count; index += 1) {
    const text = scenario === "chinese" ? "你好世界" : `字幕 ${index}`;
    dispatch({ type: "recognizing", segmentId: String(index), language: "zh-CN", sourceText: text, revision: 1 });
    dispatch({ type: "recognizedChinese", segmentId: String(index), sourceText: text, revision: 2 });
  }
}
