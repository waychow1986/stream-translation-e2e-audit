import { SpeechSession } from "./speech-session.js";
import { CaptionPipeline } from "./caption-pipeline.js";
import { translate } from "./translation-client.js";

const $ = id => document.getElementById(id);
let config;
let session = null;
let pipeline = null;
let stopping = null;
let busy = false;
let records = [];
let sources = [];
const captionRows = new Map();
let runSequence = 0;
let fontSize = Number(localStorage.getItem("sttMiniFontSize")) || 36;
const stamp = time => new Date(time).toLocaleTimeString("zh-CN", { hour12: false });
const event = message => {
    $("statusDiv").value = `[${stamp(Date.now())}] ${message}\n` + $("statusDiv").value.slice(0, 16000);
};
function errorMessage(error) {
    const message = error.name === "NotAllowedError"
        ? "麦克风权限被拒绝。请在浏览器地址栏允许麦克风访问，然后重试。" : error.message;
    $("error").textContent = message;
    $("error").hidden = false;
    event(message);
}
function setBusy(value) {
    busy = value;
    $("scenarioStartButton").disabled = value || !config;
    $("scenarioStopButton").disabled = !value || Boolean(stopping);
    $("cancelButton").disabled = !value;
    for (const id of ["candidateLanguages", "microphoneSources", "clearButton", "reloadGlossary"]) $(id).disabled = value;
}
function updateCaption(key, { text }) {
    const viewport = $("captionContent");
    const follow = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32;
    let caption = captionRows.get(key);
    if (!caption) {
        const paragraph = document.createElement("p");
        paragraph.className = "caption-entry";
        paragraph.dataset.captionId = key;
        paragraph.dataset.state = "draft";
        const span = document.createElement("span");
        span.className = "caption-text";
        const textNode = document.createTextNode("");
        span.append(textNode);
        paragraph.append(span);
        $("captionEntries").append(paragraph);
        caption = { node: paragraph, text: textNode };
        captionRows.set(key, caption);
    }
    if (caption.node.dataset.state !== "draft" && caption.text.data !== text) {
        throw new Error("字幕试图修改已结束的历史片段，已停止以避免覆盖确认内容。");
    }
    if (text.startsWith(caption.text.data)) caption.text.appendData(text.slice(caption.text.length));
    else caption.text.data = text;
    if (follow) viewport.scrollTop = viewport.scrollHeight;
}
function captionNote(caption, text) {
    if (!caption) return;
    let note = caption.node.querySelector(".caption-status-note");
    if (!note) {
        note = document.createElement("span");
        note.className = "caption-note caption-status-note";
        caption.node.append(note);
    }
    note.textContent = text;
}
function interruptCaption() {
    for (const caption of captionRows.values()) {
        if (caption.node.dataset.state !== "draft") continue;
        caption.node.dataset.state = "incomplete";
        captionNote(caption, "（未完成，未计入导出）");
    }
}
function showGlossary(metadata) {
    $("glossaryStatus").textContent = metadata.count
        ? `已加载 ${metadata.count} 条客户术语` : "0 条：尚未配置客户术语";
}
async function devices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    const selected = $("microphoneSources").value;
    $("microphoneSources").replaceChildren(new Option("默认麦克风", ""));
    for (const item of list.filter(item => item.kind === "audioinput")) {
        $("microphoneSources").add(new Option(item.label || "麦克风 " + ($("microphoneSources").length), item.deviceId));
    }
    if ([...$("microphoneSources").options].some(option => option.value === selected)) $("microphoneSources").value = selected;
}
function renderRecords() {
    $("phraseDiv").value = records.map(item => `[${stamp(item.time)}] ${item.text}`).join("\n");
    $("phraseDiv").scrollTop = $("phraseDiv").scrollHeight;
}
function showSource(text = "") {
    $("sourceText").value = [...sources, text].filter(Boolean).join("\n");
    $("sourceText").scrollTop = $("sourceText").scrollHeight;
}

async function stop(cancel = false) {
    if (!busy) return;
    if (cancel) pipeline?.cancel();
    if (stopping) return stopping;
    $("status").textContent = cancel ? "正在取消；只保留已确认字幕…" : "正在停止麦克风并完成尾句，可点击“取消待译”立即取消剩余模型请求…";
    $("captionState").textContent = "正在停止";
    stopping = (async () => {
        try {
            await session?.stop();
            if (!cancel) { pipeline?.finish(); await pipeline?.drain(); }
            $("status").textContent = cancel || pipeline?.closed
                ? "已停止，未完成内容已取消。确认字幕已保留，Original 中可复制未译原文。"
                : "已停止，尾句翻译已完成。";
        } catch (error) {
            if (error.name === "AbortError") $("status").textContent = "已取消未完成翻译，确认字幕已保留。";
            else {
                errorMessage(error);
                $("status").textContent = "已停止，但有未确认内容；请检查错误和 Original 原文。";
            }
        } finally {
            pipeline?.cancel();
            session = null;
            stopping = null;
            interruptCaption();
            $("captionState").textContent = "已停止";
            setBusy(false);
        }
    })();
    setBusy(true);
    return stopping;
}

$("settingsForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const languages = $("candidateLanguages").value.split(/[,，\s]+/).filter(Boolean);
    if (!languages.length || languages.length > 10 || new Set(languages).size !== languages.length
        || languages.some(language => !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(language))) {
        errorMessage(new Error("请输入 1–10 个不重复的候选语言代码，例如 en-US, zh-CN。"));
        return;
    }
    $("error").hidden = true;
    setBusy(true);
    $("emptyCaption").hidden = true;
    $("status").textContent = "正在获取临时令牌并打开麦克风…";
    $("captionState").textContent = "正在启动";
    const run = ++runSequence;
    const keyOf = id => `${run}-${id}`;
    pipeline = new CaptionPipeline({
        translate,
        onStart: job => {
            $("captionState").textContent = job.language.startsWith("zh") ? "中文原文 · 当前草稿"
                : job.revision ? "正在更新当前草稿" : "流式翻译 · 当前草稿";
        },
        onUpdate: update => updateCaption(keyOf(update.id), update),
        onFinal: record => {
            const caption = captionRows.get(keyOf(record.id));
            caption.node.dataset.state = record.asrConfirmed ? "confirmed" : "incomplete";
            if (record.asrConfirmed) records.push(record);
            else {
                captionNote(caption, "（尾句仅有中间识别，未计入导出）");
                event("语音服务未确认最后一段；已保留其暂定译文，Original 中可核查原文，未计入导出。");
            }
            renderRecords();
            $("captionState").textContent = !record.asrConfirmed ? "尾句待核查"
                : record.retained ? "已确认 · 缩写/数值/术语保留" : "分句已确认";
            $("latency").textContent = record.passthrough ? "中文原文直显（未调用模型）"
                : `模型首字耗时：${record.firstTokenMs} ms（服务端测量，不含语音识别）`;
        },
        onQueue: count => {
            if (busy && !stopping) $("status").textContent = count
                ? `正在识别和翻译；${count} 段处理中。当前草稿原位更新，已确认历史保持不变。`
                : "正在聆听；稳定短语会提前上屏，不必等待整句结束。";
        },
        onError: error => { errorMessage(error); void stop(true); },
    });
    session = new SpeechSession({
        sdk: window.SpeechSDK, config, languages, deviceId: $("microphoneSources").value,
        onPartial: (text, language) => {
            showSource(text);
            if (language) $("detectedLanguage").textContent = language;
            pipeline.partial(text, language);
        },
        onFinal: (text, language, detail) => {
            sources.push(text); showSource();
            if (language) $("detectedLanguage").textContent = language;
            pipeline.final(text, language, detail);
        },
        onEvent: event,
        onEnd: () => { event("语音服务结束本次会话。"); void stop(); },
        onError: error => { errorMessage(error); void stop(true); },
    });
    try {
        await session.start();
        if (!stopping && busy) {
            $("status").textContent = "正在实时识别；稳定短语提前上屏，当前草稿可更新，确认后固定。停止会完成尾句。";
            $("captionState").textContent = "正在聆听";
            await devices();
        }
    } catch (error) {
        if (error.name !== "AbortError") errorMessage(error);
        await stop(true);
    }
});
$("scenarioStopButton").addEventListener("click", () => void stop());
$("cancelButton").addEventListener("click", () => void stop(true));
$("reloadGlossary").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/glossary");
        const metadata = await response.json();
        if (!response.ok) throw new Error(metadata.error);
        showGlossary(metadata);
        $("error").hidden = true;
        event("术语表已重新校验；后续请求将使用当前词表。");
    } catch (error) { errorMessage(error); }
});
$("clearButton").addEventListener("click", () => {
    records = []; sources = [];
    renderRecords(); showSource();
    captionRows.clear();
    $("captionEntries").replaceChildren();
    $("emptyCaption").hidden = false;
    $("statusDiv").value = "";
});
$("exportButton").addEventListener("click", () => {
    if (!records.length) { $("status").textContent = "暂无确认字幕可导出；未完成内容不计入导出。"; return; }
    const blob = new Blob(["\uFEFF", records.map(item => `[${stamp(item.time)}] ${item.text}`).join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `captions-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function fullscreen(enter) {
    try {
        if (enter) await $("captionPanel").requestFullscreen();
        else await document.exitFullscreen();
    } catch (error) { errorMessage(error); }
}
$("fullscreenButton").addEventListener("click", () => void fullscreen(true));
$("exitFullscreen").addEventListener("click", () => void fullscreen(false));
function resizeFont(delta = 0) {
    fontSize = Math.max(20, Math.min(72, fontSize + delta));
    document.documentElement.style.setProperty("--caption-size", `${fontSize}px`);
    localStorage.setItem("sttMiniFontSize", String(fontSize));
}
$("fontSmaller").addEventListener("click", () => resizeFont(-4));
$("fontLarger").addEventListener("click", () => resizeFont(4));
window.addEventListener("pagehide", () => { pipeline?.cancel(); void session?.stop(); });
resizeFont();
try {
    const response = await fetch("/api/config");
    const loaded = await response.json();
    if (!response.ok) throw new Error(loaded.error);
    if (!window.SpeechSDK || !navigator.mediaDevices) throw new Error("Speech SDK 或麦克风接口不可用；请使用本机 Edge/Chrome 访问。");
    config = loaded;
    $("endpoint").value = config.speechEndpoint;
    $("region").value = config.speechRegion;
    $("modelDeployment").value = config.modelDeployment;
    $("candidateLanguages").value = config.candidateLanguages.join(", ");
    showGlossary(config.glossary);
    await devices();
    $("status").textContent = "已就绪。请确认会议收音设备，然后点击 Start。";
    setBusy(false);
} catch (error) { errorMessage(error); }
