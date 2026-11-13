import { readNdjson } from "./stream.js";

export async function translate({ text, language, context, signal, onDelta }) {
    const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, context }), signal,
    });
    if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || `翻译服务请求失败（HTTP ${response.status}）。`);
    }
    let output = "";
    let completed = null;
    for await (const event of readNdjson(response.body)) {
        if (completed) throw new Error("翻译流在完成后返回额外数据，未确认本段。");
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "delta" && typeof event.text === "string") {
            output += event.text;
            onDelta(output);
        } else if (event.type === "done" && typeof event.text === "string") completed = event;
        else throw new Error("翻译服务返回无法识别的消息。");
    }
    if (!completed || !completed.text.trim() || completed.text !== output.trim()) {
        throw new Error("翻译流异常中断或内容不完整，已显示内容保留但不计入确认结果。");
    }
    return completed;
}
