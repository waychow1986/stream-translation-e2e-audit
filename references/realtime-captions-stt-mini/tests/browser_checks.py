import argparse
import json
import time
import subprocess
import wave
import re
import hashlib
import difflib
import unicodedata
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".local" / "browser-tests"
MOCK_SDK = r"""
class Recognizer {
    constructor() { window.__recognizer = this; }
    static FromConfig() { return new Recognizer(); }
    startContinuousRecognitionAsync(ok) { ok(); }
    stopContinuousRecognitionAsync(ok) {
        if (window.__tail) this.recognized(null, {result:{text:window.__tail, language:"en-US", reason:1,
            json:JSON.stringify({NBest:[{Lexical:window.__tail}]})}});
        ok();
    }
    close() {}
}
window.SpeechSDK = {
    SpeechConfig: {fromAuthorizationToken: () => ({setProperty(){}})},
    PropertyId: {}, OutputFormat:{Detailed:1}, AutoDetectSourceLanguageConfig: {fromLanguages: () => ({})},
    AudioConfig: {fromStreamInput: () => ({close(){}})},
    SpeechRecognizer: Recognizer, ResultReason: {RecognizedSpeech:1}, CancellationReason:{Error:1}
};
"""
TRACKING = r"""
window.__tracks = [];
const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await getMedia(...args);
    window.__tracks.push(...stream.getTracks());
    return stream;
};
"""
RESPONSE_AUDIT = r"""
window.__responseAudit = [];
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
    const startedAt = performance.now();
    const response = await originalFetch(...args);
    const record = {url:response.url, httpStatus:response.status, requestBody:args[1]?.body || null,
        startedAt, receivedAt:performance.now(), text:"", finished:false, error:null};
    window.__responseAudit.push(record);
    const body = response.clone().body;
    (async () => {
        if (!body) { record.finished = true; return; }
        const reader = body.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const item = await reader.read();
                record.text += decoder.decode(item.value, {stream:!item.done});
                if (item.done) break;
            }
            record.finished = true;
        } catch (error) { record.error = error.name; }
        finally { reader.releaseLock(); }
    })();
    return response;
};
"""
MOCK_TRANSLATION = r"""
window.__modelRequests = [];
const realFetch = window.fetch.bind(window);
const encoder = new TextEncoder();
window.fetch = async (url, options) => {
    if (String(url) !== "/api/translate") return realFetch(url, options);
    const record = {input:JSON.parse(options.body), output:"", aborted:false, finished:false};
    const body = new ReadableStream({start(controller) {
        record.controller = controller;
        options.signal.addEventListener("abort", () => {
            if (!record.finished) {
                record.aborted = true;
                controller.error(new DOMException("Cancelled", "AbortError"));
            }
        });
    }});
    window.__modelRequests.push(record);
    return new Response(body, {headers:{"Content-Type":"application/x-ndjson"}});
};
window.__sendTranslation = (index, text) => {
    const record = window.__modelRequests[index];
    record.output += text;
    record.controller.enqueue(encoder.encode(JSON.stringify({type:"delta", text}) + "\n"));
};
window.__completeTranslation = index => {
    const record = window.__modelRequests[index];
    record.controller.enqueue(encoder.encode(JSON.stringify({
        type:"done", text:record.output.trim(), firstTokenMs:10
    }) + "\n"));
    record.finished = true;
    record.controller.close();
};
"""
CAPTION_AUDIT = r"""
() => {
    window.__captionAudit = {violations:[], characterAppends:0, draftReplacements:0, confirmedRows:0, firstStudyAt:null};
    const confirmed = new Map();
    const nodes = new Map();
    window.__captionObserver = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "childList" && record.removedNodes.length
                && !record.target.closest?.(".caption-note")) {
                window.__captionAudit.violations.push("Caption node removed or replaced");
            }
            if (record.type === "characterData" && record.target.parentElement.closest(".caption-text")) {
                if (record.target.data.startsWith(record.oldValue || "")) window.__captionAudit.characterAppends++;
                else window.__captionAudit.draftReplacements++;
                if (!record.target.data) window.__captionAudit.violations.push("Draft cleared during replacement");
            }
        }
        if (window.__captionAudit.firstStudyAt===null
            && [...document.querySelectorAll(".caption-text")].some(node=>node.textContent.includes("研究"))) {
            window.__captionAudit.firstStudyAt=performance.now();
        }
        if (document.querySelectorAll(".caption-entry[data-state=draft]").length > 1) {
            window.__captionAudit.violations.push("Multiple simultaneous visible drafts");
        }
        for (const row of document.querySelectorAll(".caption-entry")) {
            const id = row.dataset.captionId;
            if (nodes.has(id) && nodes.get(id) !== row) window.__captionAudit.violations.push("Caption node replaced");
            nodes.set(id, row);
        }
        for (const row of document.querySelectorAll(".caption-entry[data-state=confirmed]")) {
            const text = row.querySelector(".caption-text").textContent;
            if (confirmed.has(row.dataset.captionId) && confirmed.get(row.dataset.captionId) !== text) {
                window.__captionAudit.violations.push("Confirmed caption changed");
            }
            confirmed.set(row.dataset.captionId, text);
        }
        window.__captionAudit.confirmedRows = confirmed.size;
    });
    window.__captionObserver.observe(document.querySelector("#captionEntries"), {
        subtree:true, childList:true, characterData:true, characterDataOldValue:true,
        attributes:true, attributeFilter:["data-state"]
    });
}
"""
VOICE_TIMING = r"""
window.__speechClock={voiceAt:null,firstAsrFinalAt:null};
const originalMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async(...args)=>{
    const stream=await originalMedia(...args);
    const context=new AudioContext();await context.resume();window.__voiceContext=context;
    const source=context.createMediaStreamSource(stream), analyser=context.createAnalyser(), gain=context.createGain();
    analyser.fftSize=256;gain.gain.value=0;source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);
    const samples=new Float32Array(256);
    const timer=setInterval(()=>{
        analyser.getFloatTimeDomainData(samples);
        if(Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/256)>0.003){
            window.__speechClock.voiceAt=performance.now();clearInterval(timer);
        }
    },8);
    return stream;
};
"""

def watch_asr_final(page):
    page.evaluate("""() => {
        window.__asrFinals = [];
        const create=SpeechSDK.SpeechRecognizer.FromConfig;
        SpeechSDK.SpeechRecognizer.FromConfig=function(...args){
            const recognizer=create.apply(this,args);
            let handler;
            Object.defineProperty(recognizer,"recognized",{
                configurable:true,get:()=>handler,set:callback=>{
                    handler=(sender,event)=>{
                        if(event.result.text) {
                            window.__speechClock.firstAsrFinalAt??=performance.now();
                            window.__asrFinals.push({
                                text:event.result.text, language:event.result.language, atMs:performance.now(),
                                lexical:JSON.parse(event.result.json).NBest?.[0]?.Lexical || event.result.text
                            });
                        }
                        callback(sender,event);
                    };
                }
            });
            return recognizer;
        };
    }""")

def mock_checks(browser, base):
    context = browser.new_context(accept_downloads=True, permissions=["microphone"])
    context.add_init_script(TRACKING)
    context.add_init_script(MOCK_TRANSLATION)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js",
               lambda route: route.fulfill(content_type="text/javascript", body=MOCK_SDK))
    page.route("**/api/token", lambda route: route.fulfill(json={
        "token": "mock-short-token", "expiresAt": int(time.time() * 1000) + 540000}))
    page.goto(base, wait_until="networkidle")
    assert page.locator("#scenarioStartButton").is_enabled()
    page.screenshot(path=str(OUTPUT / "draft-mock-ready.png"), full_page=True)
    page.evaluate(CAPTION_AUDIT)
    page.locator("#scenarioStartButton").click()
    page.wait_for_function("() => window.__recognizer !== undefined")
    def emit(text, language, final):
        page.evaluate("""([text,language,final]) => {
            window.__recognizer[final ? 'recognized' : 'recognizing'](
                null, {result:{text, language, reason:1,json:JSON.stringify({NBest:[{Lexical:text}]})}});
        }""", [text, language, final])
    for i in range(12):
        emit("unfinished" + str(i), "en-US", False)
    page.wait_for_timeout(500)
    assert page.evaluate("window.__modelRequests.length") == 0
    assert page.locator(".caption-entry").count() == 0
    assert "unfinished" in page.locator("#sourceText").input_value()
    emit("This is a final sentence.", "en-US", True)
    page.wait_for_function("() => window.__modelRequests.length === 1")
    for chunk in ["本段", "确认的", "中文字幕。"]:
        page.evaluate("chunk => window.__sendTranslation(0, chunk)", chunk)
        page.wait_for_timeout(50)
    first = page.locator(".caption-entry").first
    assert first.locator(".caption-text").inner_text() == "本段确认的中文字幕。"
    page.evaluate("window.__firstCaptionNode = document.querySelector('.caption-entry')")
    position = first.bounding_box()
    viewport_height = page.locator("#captionContent").bounding_box()["height"]
    color = first.evaluate("node => getComputedStyle(node).color")
    emit("The next sentence is still being recognized.", "en-US", False)
    assert first.locator(".caption-text").inner_text() == "本段确认的中文字幕。"
    page.evaluate("window.__completeTranslation(0)")
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('本段确认')")
    assert page.evaluate("document.querySelector('.caption-entry') === window.__firstCaptionNode")
    assert first.bounding_box()["y"] == position["y"]
    assert first.evaluate("node => getComputedStyle(node).color") == color
    assert first.locator(".caption-text").inner_text() == "本段确认的中文字幕。"
    emit("中文中间识别也不直接上屏。", "zh-CN", False)
    assert page.locator(".caption-entry").count() == 1
    emit("这是一段中文原文。", "zh-CN", True)
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('这是一段中文原文')")
    assert page.evaluate("window.__modelRequests.length") == 1
    page.evaluate("window.__tail = 'Please preserve the final sentence.'")
    page.locator("#scenarioStopButton").click()
    page.wait_for_function("() => window.__modelRequests.length === 2")
    page.evaluate("window.__sendTranslation(1, '尾句已保留。'); window.__completeTranslation(1)")
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled")
    assert "尾句已保留" in page.locator("#phraseDiv").input_value()
    assert page.evaluate("window.__tracks.length > 0 && window.__tracks.every(t => t.readyState === 'ended')")
    assert page.locator("#captionContent").bounding_box()["height"] == viewport_height
    page.evaluate("window.__tail = null")
    page.locator("#scenarioStartButton").click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('正在实时')")
    emit("A sentence that will be cancelled.", "en-US", True)
    page.wait_for_function("() => window.__modelRequests.length === 3")
    page.evaluate("window.__sendTranslation(2, '未完成的文字')")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[3].textContent.length > 0")
    page.locator("#cancelButton").click()
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled")
    assert page.evaluate("window.__modelRequests[2].aborted")
    assert page.locator(".caption-entry").last.get_attribute("data-state") == "incomplete"
    assert page.locator(".caption-entry").last.locator(".caption-text").inner_text() == "未完成的文字"
    assert "未完成" in page.locator(".caption-note").inner_text()
    page.wait_for_timeout(100)
    assert not page.locator("#status").inner_text().startswith("正在聆听")
    with page.expect_download() as download:
        page.locator("#exportButton").click()
    exported = Path(download.value.path()).read_text(encoding="utf-8-sig")
    assert "未完成的文字" not in exported and "尾句已保留" in exported
    before = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--caption-size')")
    page.locator("#fontLarger").click()
    assert before != page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--caption-size')")
    page.locator("#fullscreenButton").click()
    page.wait_for_function("() => document.fullscreenElement !== null")
    page.locator("#exitFullscreen").click()
    page.wait_for_function("() => document.fullscreenElement === null")
    page.screenshot(path=str(OUTPUT / "draft-mock-desktop.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=str(OUTPUT / "draft-mock-mobile.png"), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 960})
    audit = page.evaluate("window.__captionAudit")
    assert not audit["violations"], audit
    assert audit["confirmedRows"] == 3 and audit["characterAppends"] >= 6, audit
    page.locator("#scenarioStartButton").click()
    page.wait_for_function("() => document.querySelector('#status').textContent.includes('正在实时')")
    page.locator("#captionContent").evaluate("node => node.scrollTop = node.scrollHeight")
    for index in range(3, 5):
        emit("A confirmed source for progressive wrap testing.", "en-US", True)
        page.wait_for_function("count => window.__modelRequests.length === count", arg=index + 1)
        for chunk in ["这是一段用于逐字追加和换行测试的中文。" for _ in range(5)]:
            page.evaluate("([index,chunk]) => window.__sendTranslation(index, chunk)", [index, chunk])
            page.wait_for_timeout(40)
            metrics = page.locator("#captionContent").evaluate(
                "node => ({height:node.clientHeight, total:node.scrollHeight, top:node.scrollTop})")
            assert metrics["total"] - metrics["height"] - metrics["top"] < 2, metrics
        page.evaluate("index => window.__completeTranslation(index)", index)
        page.wait_for_function("() => document.querySelectorAll('.caption-entry[data-state=draft]').length === 0")
    for _ in range(4):
        emit("这是一段用于字幕滚动检查的中文。" * 4, "zh-CN", True)
    assert page.locator("#captionContent").evaluate("node => node.scrollHeight > node.clientHeight")
    assert page.locator("#captionContent").evaluate("node => node.scrollHeight - node.scrollTop - node.clientHeight < 2")
    page.locator("#captionContent").evaluate("node => node.scrollTop = 0")
    emit("查看旧字幕时，不应自动跳回底部。", "zh-CN", True)
    assert page.locator("#captionContent").evaluate("node => node.scrollTop") == 0
    page.locator("#scenarioStopButton").click()
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled")
    assert not page.evaluate("window.__captionAudit.violations"), page.evaluate("window.__captionAudit")
    audit = page.evaluate("window.__captionAudit")
    page.evaluate("window.__captionObserver.disconnect()")
    page.locator("#clearButton").click()
    assert not page.locator("#phraseDiv").input_value()
    assert page.locator(".caption-entry").count() == 0
    assert not errors, errors
    context.close()
    denied = browser.new_context()
    denied.add_init_script("""navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Synthetic permission denial', 'NotAllowedError');
    };""")
    page = denied.new_page()
    page.route("**/api/token", lambda route: route.fulfill(json={
        "token": "mock-token", "expiresAt": int(time.time()*1000)+540000}))
    page.goto(base, wait_until="networkidle")
    page.locator("#scenarioStartButton").click()
    page.wait_for_function("() => !document.querySelector('#error').hidden")
    assert "权限被拒绝" in page.locator("#error").inner_text()
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled")
    denied.close()
    return {"mode": "mock", "captionMode": "single_revisable_draft",
            "checks": ["unstable short input waits", "final-only input translates once",
             "immutable confirmed history and single current draft", "same DOM node/position/color after confirmation",
             "Chinese bypass", "stop tail", "microphone release", "fixed viewport height",
             "auto-follow new captions", "manual history scroll remains in place",
             "export excludes incomplete text", "font size", "fullscreen", "mobile width",
             "restart", "cancel preserves incomplete text", "permission denial"],
            "captionMutationAudit": audit, "pageErrors": errors}

def phrase_checks(browser, base):
    context = browser.new_context(accept_downloads=True, permissions=["microphone"])
    context.add_init_script(TRACKING)
    context.add_init_script(MOCK_TRANSLATION)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/vendor/microsoft.cognitiveservices.speech.sdk.bundle-min.js",
               lambda route: route.fulfill(content_type="text/javascript", body=MOCK_SDK))
    page.route("**/api/token", lambda route: route.fulfill(json={
        "token": "mock-short-token", "expiresAt": int(time.time() * 1000) + 540000}))
    page.goto(base, wait_until="networkidle")
    page.evaluate(CAPTION_AUDIT)
    page.locator("#scenarioStartButton").click()
    page.wait_for_function("() => window.__recognizer !== undefined")
    def emit(text, final=False, lexical=None):
        page.evaluate("""([text,final,lexical]) => {
            window.__recognizer[final?'recognized':'recognizing'](null,{
                result:{text,language:"en-US",reason:1,json:JSON.stringify({NBest:[{Lexical:lexical||text}]})}
            });
        }""", [text, final, lexical])
    def repeat(text):
        emit(text)
        emit(text)
    def wait_requests(count):
        page.wait_for_function("n=>window.__modelRequests.length===n", arg=count)
    def complete(index, text):
        page.evaluate("([i,text])=>{window.__sendTranslation(i,text);window.__completeTranslation(i);}", [index, text])
    emit("This fictional clinical study")
    emit("This fictional clinical study enrolled")
    emit("This fictional clinical study enrolled three")
    wait_requests(1)
    assert page.evaluate("window.__modelRequests[0].input.text") == "This fictional clinical study"
    complete(0, "这项虚构的临床研究")
    page.wait_for_function("() => document.querySelector('.caption-text')?.textContent.includes('研究')")
    assert not page.locator("#phraseDiv").input_value(), "ASR interim was incorrectly exported"
    repeat("This fictional clinical study enrolled three hundred and")
    page.wait_for_timeout(100)
    assert page.evaluate("window.__modelRequests.length") == 1
    emit("This fictional clinical study enrolled 360 participants.", True,
         "this fictional clinical study enrolled three hundred and sixty participants")
    wait_requests(2)
    complete(1, "这项虚构的临床研究纳入了360名受试者。")
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('360')")
    repeat("The trial included thirty patients at baseline")
    wait_requests(3)
    complete(2, "试验纳入30名患者")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[1]?.textContent.includes('30')")
    repeat("The trial included forty patients at baseline")
    wait_requests(4)
    page.evaluate("window.__sendTranslation(3,'试验纳入40名患者')")
    page.wait_for_timeout(50)
    assert "30" in page.locator(".caption-text").nth(1).inner_text(), "An incomplete replacement stream overwrote the tail"
    page.evaluate("window.__completeTranslation(3)")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[1].textContent.includes('40')")
    emit("The trial included 40 patients.", True, "the trial included forty patients")
    wait_requests(5)
    complete(4, "试验纳入40名患者。")
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('40')")
    page.set_viewport_size({"width":390,"height":844})
    page.wait_for_timeout(100)
    source = "This fictional clinical study enrolled three hundred and sixty participants across twelve research centers and evaluated safety outcomes after treatment today"
    repeat(source)
    wait_requests(6)
    complete(5, "这项虚构的临床研究")
    wait_requests(7)
    long_draft = "这项虚构的临床研究在12个研究中心纳入360名受试者，并评估治疗后的安全性结局"
    complete(6, long_draft)
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[2]?.textContent.includes('安全性')")
    assert len(page.locator(".caption-text").nth(2).inner_text()) > 22
    page.evaluate("window.__revisedCaptionNode = document.querySelectorAll('.caption-entry')[2]")
    emit(source.replace("twelve", "ten"))
    page.wait_for_timeout(100)
    assert page.evaluate("window.__modelRequests.length") == 7
    assert page.locator(".caption-text").nth(2).inner_text() == long_draft
    repeat(source.replace("fictional", "observational"))
    wait_requests(8)
    page.evaluate("window.__sendTranslation(7,'这项观察性临床研究')")
    page.wait_for_timeout(100)
    assert page.locator(".caption-text").nth(2).inner_text() == long_draft
    assert page.locator(".caption-entry").count() == 3
    revised = "这项观察性临床研究在12个研究中心纳入360名受试者，并评估治疗后的安全性结局。"
    page.evaluate("text => window.__sendTranslation(7,text)", revised[len("这项观察性临床研究"):])
    page.evaluate("window.__completeTranslation(7)")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[2].textContent.includes('观察性')")
    emit("This observational clinical study enrolled 360 participants across 12 research centers and evaluated safety outcomes after treatment.", True)
    wait_requests(9)
    complete(8, revised)
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('观察性')")
    assert page.locator(".caption-entry").count() == 3
    assert page.evaluate("document.querySelectorAll('.caption-entry')[2] === window.__revisedCaptionNode")
    assert page.locator(".caption-entry[data-state=review]").count() == 0
    assert page.locator(".caption-note").count() == 0
    assert "更正译文" not in page.locator("#captionEntries").inner_text()
    assert page.locator("#phraseDiv").input_value().count("观察性") == 1
    repeat("The dose was thirty milligrams daily for participants")
    wait_requests(10)
    page.evaluate("window.__sendTranslation(9,'剂量为30')")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[3]?.textContent.includes('30')")
    repeat("The dose was forty milligrams daily for participants")
    wait_requests(11)
    assert page.evaluate("window.__modelRequests[9].aborted")
    page.evaluate("window.__sendTranslation(10,'剂量为40毫克')")
    page.wait_for_timeout(100)
    assert page.locator(".caption-text").nth(3).inner_text() == "剂量为30"
    page.evaluate("window.__completeTranslation(10)")
    page.wait_for_function("() => document.querySelectorAll('.caption-text')[3].textContent.includes('40')")
    emit("The dose was 40 milligrams daily for participants.", True,
         "the dose was forty milligrams daily for participants")
    wait_requests(12)
    complete(11, "参与者每日剂量为40毫克。")
    page.wait_for_function("() => document.querySelector('#phraseDiv').value.includes('每日剂量为40')")
    emit("Please preserve this unfinished spoken tail")
    page.locator("#scenarioStopButton").click()
    wait_requests(13)
    complete(12, "尚未确认的尾句")
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled")
    assert page.locator(".caption-entry").last.get_attribute("data-state") == "incomplete"
    assert "中间识别" in page.locator(".caption-entry").last.inner_text()
    assert "尚未确认" not in page.locator("#phraseDiv").input_value()
    with page.expect_download() as download:
        page.locator("#exportButton").click()
    exported = Path(download.value.path()).read_text(encoding="utf-8-sig")
    assert "尚未确认" not in exported and "剂量为30" not in exported
    assert "虚构的临床研究在" not in exported and exported.count("观察性") == 1
    assert "360" in exported and "40" in exported and "观察性" in exported
    assert "每日剂量为40毫克" in exported
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended')")
    audit = page.evaluate("window.__captionAudit")
    assert not audit["violations"], audit
    assert not errors, errors
    assert not page.locator("#error").is_visible(), page.locator("#error").text_content()
    assert audit["draftReplacements"] >= 3, audit
    page.screenshot(path=str(OUTPUT / "draft-mock-revisions.png"), full_page=True)
    context.close()
    return {"checks": ["meaningful Chinese before ASR final", "no incomplete-number translation",
        "stable growth coalesced instead of every-word requests", "lexical/display number alignment",
        "atomic draft replacement without blanking", "early-word revision beyond 22 characters in the same DOM row",
        "unstable middle-word correction does not shrink the visible draft",
        "no duplicate correction paragraphs or obsolete-version labels",
        "complete final source translated before confirmation",
        "obsolete in-flight source aborted without a UI error",
        "numeric correction replaces one draft and preserves confirmed history",
        "unconfirmed stop tail retained but excluded from export", "only latest confirmed version exported"],
        "captionMutationAudit": audit, "modelRequests": 13}

def azure_checks(browser, base, audio):
    with wave.open(str(audio), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    context = browser.new_context(permissions=["microphone"], viewport={"width": 1360, "height": 1100})
    context.add_init_script(TRACKING)
    context.add_init_script(RESPONSE_AUDIT)
    context.add_init_script(VOICE_TIMING)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    models = []
    traffic = []
    page.on("request", lambda request: traffic.append(
        request.url + json.dumps(request.headers) + (request.post_data or "")))
    page.on("request", lambda request: models.append(request.post_data_json)
            if request.url.endswith("/api/translate") else None)
    page.goto(base, wait_until="networkidle")
    assert page.locator("#scenarioStartButton").is_enabled()
    page.evaluate(CAPTION_AUDIT)
    watch_asr_final(page)
    start = time.monotonic()
    page.locator("#scenarioStartButton").click()
    snapshots, languages, first_preview = [], set(), None
    while time.monotonic() - start < duration + 6:
        page.wait_for_timeout(100)
        texts = page.locator(".caption-text").all_text_contents()
        preview = texts[-1] if texts else ""
        language = page.locator("#detectedLanguage").inner_text()
        languages.add(language)
        if preview and (not snapshots or preview != snapshots[-1]["text"]):
            elapsed = round(time.monotonic() - start, 3)
            snapshots.append({"secondsAfterStart": elapsed, "text": preview})
            if first_preview is None:
                first_preview = elapsed
                page.screenshot(path=str(OUTPUT / "draft-azure-live-stream.png"), full_page=True)
        if page.locator("#error").is_visible():
            raise AssertionError(page.locator("#error").inner_text())
    page.locator("#scenarioStopButton").click()
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled", timeout=45000)
    finals = page.locator("#phraseDiv").input_value()
    original = page.locator("#sourceText").input_value()
    observed = {"models":models,"original":original,"confirmed":finals,
        "clock":page.evaluate("window.__speechClock"),"audit":page.evaluate("window.__captionAudit")}
    (OUTPUT / "draft-azure-observed.json").write_text(json.dumps(observed,ensure_ascii=False,indent=2),encoding="utf-8")
    assert first_preview is not None and first_preview < duration / 2
    assert len(snapshots) >= 5, snapshots
    assert any("en" in language for language in languages), languages
    assert any("zh" in language for language in languages), languages
    caption_text = "\n".join(page.locator(".caption-entry[data-state=confirmed] .caption-text").all_text_contents())
    assert re.search(r"(?:360|三百六十)(?:名|位|个)?(?:参与者|受试者|患者)", caption_text), caption_text
    assert re.search(r"(?:12|十二)(?:个|家|所)?(?:研究|试验)中心", caption_text), caption_text
    assert any(term in finals for term in ["不一定", "未必", "并不一定", "不必然"]), finals
    assert "这只是一次演示" in finals, finals
    assert re.search(r"(?:不能|不可|不应|不要).{0,8}初步.{0,8}最终结论", caption_text), caption_text
    assert "zh-CN" in languages
    assert all(not item["language"].startswith("zh") for item in models), models
    assert page.evaluate("window.__tracks.length > 0 && window.__tracks.every(t => t.readyState === 'ended')")
    confirmed = page.locator("#phraseDiv").input_value()
    page.wait_for_timeout(1500)
    assert page.locator("#phraseDiv").input_value() == confirmed
    assert models and len(models[0]["text"].split()) < len(original.splitlines()[0].split()), models
    asr_finals = page.evaluate("window.__asrFinals")
    english_finals = [item for item in asr_finals if item["language"].startswith("en")]
    assert english_finals, asr_finals
    for item in english_finals:
        punctuation = re.search(r"[.!?。！？]+$", item["text"])
        complete_source = re.sub(r"[.!?。！？]+$", "", item["lexical"].strip()) + (punctuation[0] if punctuation else "")
        assert any(model["text"] == complete_source for model in models), (
            "Final confirmation lacked a complete-source translation request", complete_source)
    assert page.locator(".caption-entry[data-state=draft]").count() == 0
    assert page.locator(".caption-entry[data-state=confirmed]").count() == len(finals.splitlines())
    assert page.locator(".caption-entry").count() == len(finals.splitlines()), "Obsolete correction rows were retained"
    assert page.locator(".caption-note").count() == 0
    assert "更正译文" not in page.locator("#captionEntries").inner_text()
    viewport_metrics = page.locator("#captionContent").evaluate(
        "node => ({height:node.clientHeight, total:node.scrollHeight, top:node.scrollTop})")
    assert viewport_metrics["total"] - viewport_metrics["height"] - viewport_metrics["top"] < 2, viewport_metrics
    audit = page.evaluate("window.__captionAudit")
    assert not audit["violations"], audit
    clock = page.evaluate("window.__speechClock")
    assert clock["voiceAt"] is not None and audit["firstStudyAt"] is not None, clock
    assert audit["firstStudyAt"] < clock["firstAsrFinalAt"], "Meaningful Chinese still waited for ASR final"
    meaningful_latency = round((audit["firstStudyAt"] - clock["voiceAt"]) / 1000, 3)
    assert not errors, errors
    assert not page.locator("#error").is_visible()
    storage = page.evaluate("JSON.stringify({...localStorage})")
    assert "token" not in storage.lower() and "key" not in storage.lower()
    secret = subprocess.check_output([
        "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
        str(ROOT / "scripts" / "read-key.ps1"), "-Path",
        str(ROOT / ".local" / "foundry-key.dpapi"),
    ]).decode("utf-8").strip()
    assert secret and all(secret not in item for item in traffic), "Permanent key present in browser requests"
    assert secret not in page.content() and secret not in storage, "Permanent key present in browser state"
    audited = page.evaluate("window.__responseAudit")
    for suffix in ["/api/config", "/api/token", "/api/translate"]:
        assert any(item["url"].endswith(suffix) for item in audited), suffix
    for item in audited:
        assert secret not in item["text"], "Permanent key present in browser API responses"
        assert item["finished"] or item["error"] == "AbortError", item["error"]
    secret = None
    page.screenshot(path=str(OUTPUT / "draft-azure-final.png"), full_page=True)
    result = {
        "mode": "azure", "captionMode": "single_revisable_draft", "audioSeconds": round(duration, 3),
        "firstCaptionSecondsAfterStart": first_preview,
        "firstCaptionMetric": "Start click to first visible Chinese text; not the primary latency metric.",
        "firstMeaningfulChineseSecondsAfterSpeech": meaningful_latency,
        "meaningfulCaptionMetric": "Detected synthetic microphone voice onset (RMS>0.003 every 8ms) to Chinese containing the study noun; includes ASR, phrase stabilization, model, network and rendering.",
        "firstAsrFinalSecondsAfterSpeech": round((clock["firstAsrFinalAt"] - clock["voiceAt"]) / 1000, 3),
        "meaningfulChineseBeforeAsrFinal": True,
        "captionSnapshots": snapshots, "detectedLanguages": sorted(languages), "modelRequests": len(models),
        "firstRequestIsShortPhrase": True, "captionMutationAudit": audit,
        "oneVisibleVersionPerConfirmedUtterance": True, "noCorrectionLabels": True,
        "fullFinalSourceRequestsVerified": len(english_finals), "ChineseNegationPreserved": True,
        "finalViewportMetrics": viewport_metrics,
        "original": original, "confirmed": finals, "finalLatencyDisplay": page.locator("#latency").inner_text(),
        "microphoneReleased": True, "noLateUpdates": True, "ChineseBypassedModel": True,
        "noCredentialsInLocalStorage": True, "pageErrors": errors,
        "permanentKeyAbsentFromRequestsApiResponsesDomAndStorage": True,
        "auditedApiResponsesIncludingCancelledPartialStreams": len(audited),
        "limitations": "Synthetic en/zh audio only; not a medical accuracy benchmark or a comparison against the old version.",
    }
    context.close()
    return result

def early_checks(browser, base, cancel):
    context = browser.new_context(permissions=["microphone"])
    context.add_init_script(TRACKING)
    context.add_init_script("window.__speechClock = {firstAsrFinalAt:null};")
    page = context.new_page()
    page.goto(base, wait_until="networkidle")
    watch_asr_final(page)
    with page.expect_request("**/api/translate", timeout=25000):
        page.locator("#scenarioStartButton").click()
    page.locator("#cancelButton" if cancel else "#scenarioStopButton").click()
    page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled", timeout=45000)
    assert page.evaluate("window.__tracks.length > 0 && window.__tracks.every(t => t.readyState === 'ended')")
    assert not page.locator("#error").is_visible(), page.locator("#error").text_content()
    original = page.locator("#sourceText").input_value()
    confirmed = page.locator("#phraseDiv").input_value()
    assert original.strip()
    asr_confirmed = page.evaluate("window.__speechClock.firstAsrFinalAt !== null")
    if not cancel:
        if asr_confirmed:
            assert confirmed.strip(), "The ASR-confirmed tail was lost at Stop"
        else:
            assert not confirmed.strip(), "An ASR interim tail was incorrectly exported"
            assert page.locator(".caption-entry[data-state=incomplete]").count() > 0
            assert "中间识别" in page.locator("#captionEntries").inner_text()
    assert page.locator(".caption-entry[data-state=draft]").count() == 0
    page.wait_for_timeout(2000)
    assert confirmed == page.locator("#phraseDiv").input_value()
    report = {
        "mode": "azure-cancel" if cancel else "azure-tail",
        "originalAtStop": original, "confirmedAfterStop": confirmed,
        "microphoneReleased": True, "noLateUpdates": True,
        "stoppedDuringFirstModelRequest": True,
        "asrFinalReceived": asr_confirmed,
    }
    context.close()
    return report

def diagnostic_findings(text):
    foreign_scripts = ("DEVANAGARI", "CYRILLIC", "ARABIC", "HEBREW", "HIRAGANA", "KATAKANA", "HANGUL", "THAI", "BENGALI")
    foreign = [{"character": char, "name": unicodedata.name(char, "")}
               for char in sorted(set(text))
               if any(script in unicodedata.name(char, "") for script in foreign_scripts)]
    return {
        "unexpectedScriptCharacters": foreign,
        "containsResearchFields": "研究领域" in text,
        "containsResourceCenters": "资源中心" in text,
        "contains360": bool(re.search(r"(?<!\d)360(?!\d)|三百六十", text)),
        "contains12ResearchCenters": bool(re.search(r"(?:12|十二)(?:个|家|所)?(?:研究|试验)中心", text)),
        "containsCanonicalHbA1c": "HbA1c" in text,
        "containsThanks": bool(re.search(r"谢谢|感谢", text)),
        "containsQuestions": bool(re.search(r"提问|问题|问答", text)),
        "note": "Diagnostic flags, not a medical accuracy score; read complete translations and source alignments.",
    }


def decode_translation(events_text):
    events = [json.loads(line) for line in events_text.splitlines() if line.strip()]
    output = "".join(event["text"] for event in events if event.get("type") == "delta")
    done = [event for event in events if event.get("type") == "done"]
    errors = [event for event in events if event.get("type") == "error"]
    complete = (not errors and len(done) == 1 and events[-1].get("type") == "done"
                and done[0]["text"] == output.strip() and bool(output.strip()))
    return {"text": output.strip(), "completed": complete, "errors": errors,
            "metadata": done[0] if len(done) == 1 else None, "findings": diagnostic_findings(output)}


def full_script_checks(browser, base, audio, source_script):
    reference = source_script.read_text(encoding="utf-8-sig").strip()
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", reference) if part.strip()]
    assert paragraphs and all(len(part) <= 4000 for part in paragraphs), "Each source paragraph must contain 1-4000 characters"
    with wave.open(str(audio), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    report = {
        "mode": "full-script", "source": reference, "paragraphs": len(paragraphs),
        "sourceSha256": hashlib.sha256(reference.encode("utf-8")).hexdigest(),
        "audioSeconds": round(duration, 3), "textOnly": [], "controls": [], "pipeline": {},
        "productionFilesSha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in ["translation.mjs", "public/caption-pipeline.js", "public/speech-session.js"]
        },
        "limitations": [
            "Synthetic Microsoft Zira audio, not the user's original recording.",
            "Injected source substitutions and forced text boundaries are controls, not observed STT errors.",
            "A few repeated translations do not establish a model error rate or prove an intermittent defect is absent.",
            "Regex flags and word differences require semantic review; they are not medical accuracy measurements.",
        ],
    }
    def checkpoint():
        (OUTPUT / "draft-full-script-progress.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    context = browser.new_context(permissions=["microphone"], viewport={"width": 1360, "height": 1100})
    context.add_init_script(TRACKING)
    context.add_init_script(RESPONSE_AUDIT)
    context.add_init_script(VOICE_TIMING)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(base, wait_until="networkidle")
        assert page.locator("#scenarioStartButton").is_enabled()
        report["config"] = context.request.get(base + "/api/config").json()
        checkpoint()

        def probe(label, text, prior, destination, kind="clean_original"):
            item = {"label": label, "kind": kind,
                    "input": {"text": text, "language": "en-US", "context": [part[-1200:] for part in prior[-3:]]}}
            destination.append(item)
            checkpoint()
            started = time.monotonic()
            response = context.request.post(base + "/api/translate", headers={"Origin": base},
                                            data=item["input"], timeout=35000)
            item["httpStatus"] = response.status
            item["requestElapsedMs"] = round((time.monotonic() - started) * 1000)
            item["response"] = response.text()
            checkpoint()
            assert response.ok, f"Translation probe {label} failed with HTTP {response.status}: {item['response']}"
            item.update(decode_translation(item.pop("response")))
            checkpoint()
            assert item["completed"], f"Translation probe {label} did not complete: {item['errors']}"
            return item

        for index, paragraph in enumerate(paragraphs):
            probe(f"paragraph_{index + 1}", paragraph, paragraphs[:index], report["textOnly"])
        for index, paragraph in enumerate(paragraphs):
            if "should not be presented as final conclusions" in paragraph:
                for repeat in (2, 3):
                    probe(f"preliminary_findings_repeat_{repeat}", paragraph, paragraphs[:index], report["textOnly"])
            marker = " due to tolerability concerns."
            if marker in paragraph:
                left, right = paragraph.split(marker, 1)
                second = marker.strip() + right
                assert left + " " + second == paragraph
                probe("tolerability_boundary_left", left, paragraphs[:index], report["controls"], "forced_boundary_correct_words")
                probe("tolerability_boundary_right", second, [*paragraphs[:index], left],
                      report["controls"], "forced_boundary_correct_words")
                lexical_style = re.sub(r"[.!?]", "", second).lower().strip() + "."
                probe("tolerability_boundary_right_without_internal_punctuation", lexical_style,
                      [*paragraphs[:index], left], report["controls"], "forced_boundary_and_removed_internal_punctuation")
            for correct, incorrect in [("study figures", "study fields"), ("research centers", "resource centers")]:
                if correct in paragraph:
                    probe(f"source_substitution_{correct.replace(' ', '_')}", paragraph.replace(correct, incorrect),
                          paragraphs[:index], report["controls"], "artificial_source_substitution")

        report["textOnlyCombined"] = "\n".join(item["text"] for item in report["textOnly"][:len(paragraphs)])
        report["textOnlyFindings"] = diagnostic_findings(report["textOnlyCombined"])
        checkpoint()
        page.evaluate(CAPTION_AUDIT)
        watch_asr_final(page)
        page.evaluate("""() => {
            window.__firstGreetingAt = null;
            new MutationObserver(() => {
                if (window.__firstGreetingAt === null && document.querySelector("#captionEntries").textContent.includes("下午好")) {
                    window.__firstGreetingAt = performance.now();
                }
            }).observe(document.querySelector("#captionEntries"), {subtree:true,childList:true,characterData:true});
        }""")
        page.locator("#scenarioStartButton").click()
        started = time.monotonic()
        last_checkpoint = 0
        while time.monotonic() - started < duration + 6:
            page.wait_for_timeout(250)
            if time.monotonic() - last_checkpoint > 5:
                report["pipeline"]["asrFinals"] = page.evaluate("window.__asrFinals")
                report["pipeline"]["captionsSoFar"] = page.locator("#phraseDiv").input_value()
                checkpoint()
                last_checkpoint = time.monotonic()
            if page.locator("#error").is_visible():
                report["pipeline"]["error"] = page.locator("#error").inner_text()
                checkpoint()
                break
        if page.locator("#scenarioStopButton").is_enabled():
            page.locator("#scenarioStopButton").click()
        page.wait_for_function("() => !document.querySelector('#scenarioStartButton').disabled", timeout=45000)
        page.wait_for_function("""() => window.__responseAudit.filter(item => item.url.endsWith("/api/translate"))
            .every(item => item.finished || item.error)""", timeout=10000)
        asr_finals = page.evaluate("window.__asrFinals")
        captions = page.locator(".caption-entry[data-state=confirmed] .caption-text").all_text_contents()
        audit = page.evaluate("window.__captionAudit")
        pipeline = report["pipeline"]
        pipeline.update({
            "asrFinals": asr_finals, "original": page.locator("#sourceText").input_value(),
            "confirmed": page.locator("#phraseDiv").input_value(), "captions": captions,
            "findings": diagnostic_findings("\n".join(captions)), "captionMutationAudit": audit,
            "clock": page.evaluate("window.__speechClock"),
            "microphoneReleased": page.evaluate("window.__tracks.length > 0 && window.__tracks.every(t => t.readyState === 'ended')"),
            "pageErrors": errors, "translations": [],
        })
        for item in page.evaluate("window.__responseAudit.filter(item => item.url.endsWith('/api/translate'))"):
            decoded = decode_translation(item["text"]) if item["finished"] else {
                "completed": False, "text": item["text"], "errors": [item["error"]]}
            pipeline["translations"].append({
                "input": json.loads(item["requestBody"]), "responseComplete": item["finished"],
                "httpStatus": item["httpStatus"], "streamError": item["error"],
                "startedAtMs": item["startedAt"], "rawResponse": item["text"], **decoded,
            })
        words = lambda text: re.findall(r"[a-z0-9]+(?:['’][a-z]+)?", text.lower())
        expected = words(reference)
        recognized = words(" ".join(item["lexical"] for item in asr_finals))
        matcher = difflib.SequenceMatcher(None, expected, recognized, autojunk=False)
        pipeline["recognitionWordDifferences"] = [
            {"operation": op, "expected": " ".join(expected[a:b]), "recognized": " ".join(recognized[c:d]),
             "referenceContext": " ".join(expected[max(0, a - 5):min(len(expected), b + 5)])}
            for op, a, b, c, d in matcher.get_opcodes() if op != "equal"
        ]
        pipeline["referenceWordCount"] = len(expected)
        pipeline["recognizedWordCount"] = len(recognized)
        for index, item in enumerate(asr_finals):
            punctuation = re.search(r"[.!?。！？]+$", item["text"])
            source = re.sub(r"[.!?。！？]+$", "", item["lexical"].strip()) + (punctuation[0] if punctuation else "")
            item["actualFullSourceRequests"] = [
                number for number, job in enumerate(pipeline["translations"]) if job["input"]["text"] == source
            ]
            item["confirmedTranslation"] = captions[index] if index < len(captions) else None
        greeting = page.evaluate("window.__firstGreetingAt")
        voice = pipeline["clock"]["voiceAt"]
        pipeline["firstGreetingSecondsAfterSpeech"] = round((greeting - voice) / 1000, 3) if greeting is not None and voice is not None else None
        before = pipeline["confirmed"]
        page.wait_for_timeout(1500)
        pipeline["noLateConfirmedUpdates"] = before == page.locator("#phraseDiv").input_value()
        pipeline["oneCaptionPerAsrFinal"] = len(captions) == len(asr_finals) == page.locator(".caption-entry").count()
        checkpoint()
        page.screenshot(path=str(OUTPUT / "draft-full-script-final.png"), full_page=True)
        assert not pipeline.get("error"), pipeline.get("error")
        assert not errors and not audit["violations"], (errors, audit)
        assert pipeline["microphoneReleased"] and pipeline["noLateConfirmedUpdates"]
        assert pipeline["oneCaptionPerAsrFinal"], "Final recognition and caption counts differ"
        assert all(item["actualFullSourceRequests"] for item in asr_finals), "An ASR final lacks its full-source model request"
        return report
    finally:
        context.close()


parser = argparse.ArgumentParser()
parser.add_argument("--mode", choices=["mock", "azure", "azure-tail", "azure-cancel", "full-script"], default="mock")
parser.add_argument("--base-url", default="http://127.0.0.1:5174")
parser.add_argument("--audio", type=Path)
parser.add_argument("--source-script", type=Path)
args = parser.parse_args()
OUTPUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    launch_args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
    if args.mode.startswith("azure") or args.mode == "full-script":
        if not args.audio:
            parser.error("--audio is required for real speech verification")
        launch_args.append("--use-file-for-fake-audio-capture=" + str(args.audio.resolve()) + "%noloop")
    browser = playwright.chromium.launch(channel="msedge", headless=True, args=launch_args)
    try:
        if args.mode == "mock":
            report = mock_checks(browser, args.base_url)
            report["draftChecks"] = phrase_checks(browser, args.base_url)
        elif args.mode == "azure":
            report = azure_checks(browser, args.base_url, args.audio)
        elif args.mode == "full-script":
            if not args.source_script:
                parser.error("--source-script is required for full-script diagnostics")
            report = full_script_checks(browser, args.base_url.rstrip("/"), args.audio, args.source_script)
        else:
            report = early_checks(browser, args.base_url, args.mode == "azure-cancel")
        (OUTPUT / f"draft-{args.mode}-browser-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.mode == "full-script":
            print(json.dumps({
                "mode": report["mode"], "audioSeconds": report["audioSeconds"],
                "textOnlyRequests": len(report["textOnly"]), "controlRequests": len(report["controls"]),
                "asrFinals": len(report["pipeline"]["asrFinals"]),
                "liveModelRequests": len(report["pipeline"]["translations"]),
                "recognitionWordDifferences": len(report["pipeline"]["recognitionWordDifferences"]),
                "textOnlyFindings": report["textOnlyFindings"],
                "pipelineFindings": report["pipeline"]["findings"],
                "report": str(OUTPUT / "draft-full-script-browser-validation.json"),
            }, ensure_ascii=True, indent=2))
        else:
            print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        browser.close()
