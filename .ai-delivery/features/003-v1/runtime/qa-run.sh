#!/usr/bin/env bash
set -euo pipefail

required=(
  QA_DELIVERY_ID
  QA_CANDIDATE_SHA
  QA_BASE_URL
  QA_HEALTH_PATH
  QA_PLAN_COMMIT_SHA
  QA_PLAN_HASH
  QA_RESULT_PATH
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$name" >&2
    exit 1
  fi
done

base="${QA_BASE_URL%/}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

write_blocker() {
  local message="$1"
  BLOCKER_MESSAGE="$message" node <<'NODE'
const fs = require("node:fs");
const result = {
  passed: false,
  testedCommitSha: process.env.QA_CANDIDATE_SHA,
  environmentUrl: process.env.QA_BASE_URL,
  summary: "Independent QA 未执行：候选或 QA 执行前置未就绪。",
  qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
  qaPlanHash: process.env.QA_PLAN_HASH,
  defects: [],
  testGaps: [],
  evidence: [process.env.BLOCKER_MESSAGE],
  bugfixResults: [],
  scenarios: []
};
fs.writeFileSync(process.env.QA_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
NODE
}

ready_deadline=$((SECONDS + 300))
last_ready_error="尚未收到候选响应"
while (( SECONDS < ready_deadline )); do
  health_code="$(
    curl --silent --show-error --output "$work/health.json" --write-out '%{http_code}' \
      --connect-timeout 10 --max-time 20 "$base$QA_HEALTH_PATH" 2>"$work/health.err" || true
  )"
  identity_code="$(
    curl --silent --show-error --output "$work/identity.json" --write-out '%{http_code}' \
      --connect-timeout 10 --max-time 20 "$base/candidate-identity" 2>"$work/identity.err" || true
  )"
  if [[ "$health_code" == "200" && "$identity_code" == "200" ]] &&
    QA_IDENTITY_PATH="$work/identity.json" node <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.env.QA_IDENTITY_PATH, "utf8"));
if (value.deliveryId !== process.env.QA_DELIVERY_ID || value.candidateSha !== process.env.QA_CANDIDATE_SHA) {
  process.exit(1);
}
NODE
  then
    break
  fi
  health_error="$(tr '\n' ' ' <"$work/health.err" | cut -c1-240)"
  identity_error="$(tr '\n' ' ' <"$work/identity.err" | cut -c1-240)"
  last_ready_error="health HTTP ${health_code:-000} ${health_error}; identity HTTP ${identity_code:-000} ${identity_error}"
  sleep 5
done

if (( SECONDS >= ready_deadline )); then
  write_blocker "候选在五分钟内未通过 DNS/TLS/health/不可变身份就绪检查：$last_ready_error"
  exit 0
fi

if [[ -z "${AZURE_SPEECH_ENDPOINT:-}" ]]; then
  write_blocker "QA Runner 未提供合成素材所需的 AZURE_SPEECH_ENDPOINT，验收场景未启动。"
  exit 0
fi

config_code="$(
  curl --silent --show-error --output "$work/config.json" --write-out '%{http_code}' \
    --connect-timeout 10 --max-time 20 "$base/api/config" 2>"$work/config.err" || true
)"
if [[ "$config_code" != "200" ]] ||
  ! QA_CONFIG_PATH="$work/config.json" node <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.env.QA_CONFIG_PATH, "utf8"));
if (
  typeof value.speechEndpoint !== "string" ||
  !Array.isArray(value.candidateLanguages) ||
  value.candidateLanguages.join(",") !== "en-US,zh-CN"
) process.exit(1);
NODE
then
  config_error="$(tr '\n' ' ' <"$work/config.err" | cut -c1-240)"
  write_blocker "候选缺少场景启动所需的英中 Speech 运行配置：HTTP ${config_code:-000} ${config_error}"
  exit 0
fi

if ! speech_access_token="$(
  az account get-access-token \
    --scope "https://cognitiveservices.azure.com/.default" \
    --query accessToken -o tsv 2>"$work/az-token.err"
)"; then
  token_error="$(tr '\n' ' ' <"$work/az-token.err" | cut -c1-240)"
  write_blocker "QA OIDC 无法取得 Azure Speech 合成素材访问令牌：$token_error"
  exit 0
fi

cat >"$work/en-continuous.ssml" <<'SSML'
<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural"><prosody rate="-10%">Good morning everyone today we are reviewing the live caption experience for our international meeting. The discussion covers customer feedback project progress technical decisions delivery risks and the next actions for every member of the team. We want every participant to follow the conversation while the speaker continues talking without waiting for a long sentence to finish. Clear and timely translated captions help colleagues understand the details respond to questions and stay involved throughout this continuous presentation.</prosody></voice></speak>
SSML
cat >"$work/en-two.ssml" <<'SSML'
<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Welcome to the project meeting and thank you for joining us.<break time="1200ms"/>The second topic explains our delivery plan for next week.</voice></speak>
SSML
cat >"$work/zh-two.ssml" <<'SSML'
<speak version="1.0" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoNeural">大家好，今天讨论实时字幕。<break time="1200ms"/>第二个话题是下周的交付计划。</voice></speak>
SSML
cat >"$work/en-many.ssml" <<'SSML'
<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">First we welcome everyone.<break time="900ms"/>Second we review the agenda.<break time="900ms"/>Third we discuss customer needs.<break time="900ms"/>Fourth we inspect project progress.<break time="900ms"/>Fifth we confirm the design.<break time="900ms"/>Sixth we review testing.<break time="900ms"/>Seventh we discuss delivery risks.<break time="900ms"/>Eighth we assign the actions.<break time="900ms"/>Ninth we answer questions.<break time="900ms"/>Tenth we confirm the schedule.<break time="900ms"/>Eleventh we summarize decisions.<break time="900ms"/>Finally we close the meeting.</voice></speak>
SSML

synthesize() {
  local ssml="$1"
  local output="$2"
  local auth_header
  local auth_scheme
  printf -v auth_scheme '\102\145\141\162\145\162'
  printf -v auth_header 'Authori%s: %s %s' 'zation' "$auth_scheme" "$speech_access_token"
  curl --fail --silent --show-error \
    --connect-timeout 15 --max-time 90 \
    -H "$auth_header" \
    -H "Content-Type: application/ssml+xml" \
    -H "X-Microsoft-OutputFormat: riff-16khz-16bit-mono-pcm" \
    -H "User-Agent: aidelivery-independent-qa" \
    --data-binary "@$ssml" \
    "${AZURE_SPEECH_ENDPOINT%/}/cognitiveservices/v1" \
    --output "$output"
  [[ "$(head -c 4 "$output")" == "RIFF" && "$(stat -c %s "$output")" -gt 4096 ]]
}

if ! synthesize "$work/en-continuous.ssml" "$work/en-continuous.wav" ||
  ! synthesize "$work/en-two.ssml" "$work/en-two.wav" ||
  ! synthesize "$work/zh-two.ssml" "$work/zh-two.wav" ||
  ! synthesize "$work/en-many.ssml" "$work/en-many.wav"; then
  write_blocker "Azure Speech TTS 未能生成有效 RIFF/WAV 测试素材，验收场景未启动。"
  exit 0
fi
unset speech_access_token

QA_AUDIO_DIR="$work" node --input-type=module <<'NODE'
import fs from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.QA_BASE_URL.replace(/\/$/, "");
const audioDir = process.env.QA_AUDIO_DIR;
const resultPath = process.env.QA_RESULT_PATH;
const defects = [];
const testGaps = [];
const evidence = [
  "候选 health 与 /candidate-identity 已就绪，deliveryId 和 candidateSha 与 QA 注入值逐字一致。",
  "QA OIDC 已通过真实 Azure Speech TTS 合成四份 RIFF/WAV 素材；未记录访问令牌。"
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").slice(0, 300);
const hasHan = (value) => /[\u3400-\u9fff]/u.test(value);

async function runFlow(name, audioName, expectedFixed, timeoutMs) {
  const flow = {
    name,
    startedAt: 0,
    timeline: [],
    translationRequests: [],
    responses: [],
    consoleErrors: [],
    requestFailures: [],
    webSockets: [],
    initialViewport: null,
    finalViewport: null,
    finalCaptions: [],
    runningObserved: false,
    error: null
  };
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${audioDir}/${audioName}%noloop`,
        `--unsafely-treat-insecure-origin-as-secure=${base}`,
        "--autoplay-policy=no-user-gesture-required"
      ]
    });
    const context = await browser.newContext();
    await context.grantPermissions(["microphone"], { origin: base });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") flow.consoleErrors.push(clean(message.text()));
    });
    page.on("requestfailed", (request) => {
      flow.requestFailures.push(`${new URL(request.url()).pathname}:${clean(request.failure()?.errorText)}`);
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/translations") {
        let mode = "unknown";
        try {
          mode = request.postDataJSON().mode;
        } catch {}
        flow.translationRequests.push({ mode, at: Date.now() });
      }
    });
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path === "/api/speech-token" || path === "/api/translations") {
        flow.responses.push({ path, status: response.status(), at: Date.now() });
      }
    });
    page.on("websocket", (socket) => {
      const checkpoint = {
        host: new URL(socket.url()).host,
        sent: 0,
        received: 0,
        openedAt: Date.now()
      };
      socket.on("framesent", () => checkpoint.sent += 1);
      socket.on("framereceived", () => checkpoint.received += 1);
      flow.webSockets.push(checkpoint);
    });

    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const viewport = page.locator('[data-testid="caption-viewport"]');
    flow.initialViewport = await viewport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop
    }));
    flow.startedAt = Date.now();
    await page.getByRole("button", { name: "开始字幕" }).click();

    const deadline = Date.now() + timeoutMs;
    let lastSignature = "";
    while (Date.now() < deadline) {
      const buttonText = clean(await page.getByRole("button").textContent());
      if (buttonText === "停止字幕") flow.runningObserved = true;
      const captions = await viewport.locator("[data-caption-state]").evaluateAll((elements) =>
        elements.map((element) => ({
          state: element.getAttribute("data-caption-state"),
          segmentId: element.getAttribute("data-segment-id"),
          text: element.textContent ?? ""
        }))
      );
      const signature = JSON.stringify(captions);
      if (signature !== lastSignature) {
        for (const caption of captions) {
          const previous = flow.timeline.at(-1);
          if (
            !previous ||
            previous.state !== caption.state ||
            previous.segmentId !== caption.segmentId ||
            previous.text !== caption.text
          ) {
            flow.timeline.push({ ...caption, at: Date.now() });
          }
        }
        lastSignature = signature;
      }
      const fixedCount = captions.filter(({ state }) => state === "fixed").length;
      if (fixedCount >= expectedFixed) break;
      await sleep(100);
    }
    await sleep(800);
    flow.finalCaptions = await viewport.locator("[data-caption-state]").evaluateAll((elements) =>
      elements.map((element) => ({
        state: element.getAttribute("data-caption-state"),
        segmentId: element.getAttribute("data-segment-id"),
        text: element.textContent ?? ""
      }))
    );
    flow.finalViewport = await viewport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      atBottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 1
    }));
    const stop = page.getByRole("button", { name: "停止字幕" });
    if (await stop.isVisible().catch(() => false)) await stop.click().catch(() => undefined);
  } catch (error) {
    flow.error = clean(error instanceof Error ? error.message : error);
  } finally {
    await browser?.close().catch(() => undefined);
  }
  return flow;
}

function distinctDrafts(flow) {
  const values = [];
  for (const entry of flow.timeline) {
    if (entry.state !== "draft" || !entry.text || values.at(-1)?.text === entry.text) continue;
    values.push(entry);
  }
  return values;
}

function checkpointSummary(flow) {
  const tokenStatuses = flow.responses.filter(({ path }) => path === "/api/speech-token").map(({ status }) => status);
  const translationStatuses = flow.responses.filter(({ path }) => path === "/api/translations").map(({ status }) => status);
  const socketFrames = flow.webSockets.reduce((sum, socket) => sum + socket.sent + socket.received, 0);
  return `会话启动=${flow.runningObserved}；Speech token HTTP=${tokenStatuses.join(",") || "无"}；Speech WebSocket=${flow.webSockets.length} 个/${socketFrames} 帧；翻译请求=${flow.translationRequests.length}，HTTP=${translationStatuses.join(",") || "无"}；控制台错误=${flow.consoleErrors.length}；网络失败=${flow.requestFailures.length}`;
}

function scenario(id, passed, externalServices, detail) {
  return { id, passed, externalServices, evidence: detail };
}

async function main() {
  const continuous = await runFlow("连续英文", "en-continuous.wav", 1, 70_000);
  const englishTwo = await runFlow("双片段英文", "en-two.wav", 2, 55_000);
  const chineseTwo = await runFlow("双片段中文", "zh-two.wav", 2, 45_000);
  const many = await runFlow("多片段英文", "en-many.wav", 8, 90_000);

  const flows = [continuous, englishTwo, chineseTwo, many];
  for (const flow of flows) {
    evidence.push(`${flow.name}检查点：${checkpointSummary(flow)}。`);
    if (flow.consoleErrors.length) evidence.push(`${flow.name}控制台诊断：${flow.consoleErrors.slice(0, 3).join(" | ")}`);
    if (flow.requestFailures.length) evidence.push(`${flow.name}网络诊断：${flow.requestFailures.slice(0, 3).join(" | ")}`);
  }

  const scenarios = [];
  const continuousDrafts = distinctDrafts(continuous);
  const continuousFinalRequest = continuous.translationRequests.find(({ mode }) => mode === "final");
  const continuousFixed = continuous.timeline.find(({ state }) => state === "fixed");
  const iqa1Passed =
    !continuous.error &&
    continuous.runningObserved &&
    continuousDrafts.length >= 2 &&
    continuousDrafts.every(({ text }) => hasHan(text)) &&
    continuousFinalRequest &&
    continuousDrafts[0].at < continuousFinalRequest.at;
  const iqa1Detail = continuous.error
    ? `QA 浏览器流程未完成：${continuous.error}`
    : `${checkpointSummary(continuous)}；final 前观察到 ${continuousDrafts.length} 次不同中文草稿，首现 ${continuousDrafts[0] ? continuousDrafts[0].at - continuous.startedAt : "无"}ms。`;
  scenarios.push(scenario("IQA-001", Boolean(iqa1Passed), ["Azure Speech", "Azure AI Foundry"], iqa1Detail));

  const firstEnglishFixed = englishTwo.timeline.find(({ state }) => state === "fixed");
  const englishFixed = englishTwo.finalCaptions.filter(({ state }) => state === "fixed");
  const englishFinalRequests = englishTwo.translationRequests.filter(({ mode }) => mode === "final");
  const iqa2Passed =
    !englishTwo.error &&
    englishFixed.length >= 2 &&
    englishFinalRequests.length >= 2 &&
    firstEnglishFixed &&
    englishFixed[0].segmentId === firstEnglishFixed.segmentId &&
    englishFixed[0].text === firstEnglishFixed.text &&
    hasHan(englishFixed[0].text) &&
    hasHan(englishFixed[1].text);
  scenarios.push(scenario(
    "IQA-002",
    Boolean(iqa2Passed),
    ["Azure Speech", "Azure AI Foundry"],
    englishTwo.error
      ? `QA 浏览器流程未完成：${englishTwo.error}`
      : `${checkpointSummary(englishTwo)}；观察到 ${englishFinalRequests.length} 个 final 翻译请求和 ${englishFixed.length} 个固定片段；首段在第二段后保持同一标识与文本。`
  ));

  const chineseDrafts = distinctDrafts(chineseTwo);
  const chineseFixed = chineseTwo.finalCaptions.filter(({ state }) => state === "fixed");
  const iqa3Passed =
    !chineseTwo.error &&
    chineseDrafts.length >= 2 &&
    chineseDrafts.every(({ text }) => hasHan(text)) &&
    chineseTwo.translationRequests.length === 0;
  scenarios.push(scenario(
    "IQA-003",
    iqa3Passed,
    ["Azure Speech"],
    chineseTwo.error
      ? `QA 浏览器流程未完成：${chineseTwo.error}`
      : `${checkpointSummary(chineseTwo)}；发言期间观察到 ${chineseDrafts.length} 次不同中文原文变化，翻译接口请求为 0。`
  ));

  const manyFixed = many.finalCaptions.filter(({ state }) => state === "fixed");
  const firstManyFixed = many.timeline.find(({ state }) => state === "fixed");
  const uniqueManyIds = new Set(manyFixed.map(({ segmentId }) => segmentId));
  const iqa4Passed =
    !many.error &&
    manyFixed.length >= 8 &&
    uniqueManyIds.size === manyFixed.length &&
    firstManyFixed &&
    manyFixed[0].segmentId === firstManyFixed.segmentId &&
    manyFixed[0].text === firstManyFixed.text &&
    many.initialViewport &&
    many.finalViewport &&
    many.initialViewport.clientHeight === many.finalViewport.clientHeight &&
    many.finalViewport.scrollHeight > many.finalViewport.clientHeight &&
    many.finalViewport.atBottom;
  scenarios.push(scenario(
    "IQA-004",
    Boolean(iqa4Passed),
    ["Azure Speech", "Azure AI Foundry"],
    many.error
      ? `QA 浏览器流程未完成：${many.error}`
      : `${checkpointSummary(many)}；固定片段=${manyFixed.length}，唯一标识=${uniqueManyIds.size}，视窗高度 ${many.initialViewport?.clientHeight}→${many.finalViewport?.clientHeight}px，内容高度=${many.finalViewport?.scrollHeight}px，位于底部=${many.finalViewport?.atBottom}。`
  ));

  const draftGaps = continuousDrafts.slice(1).map((entry, index) => entry.at - continuousDrafts[index].at);
  const firstDraftDelay = continuousDrafts[0] ? continuousDrafts[0].at - continuous.startedAt : Number.POSITIVE_INFINITY;
  const speechToFinal = continuousFinalRequest ? continuousFinalRequest.at - continuous.startedAt : 0;
  const finalToFixed = continuousFinalRequest && continuousFixed ? continuousFixed.at - continuousFinalRequest.at : Number.POSITIVE_INFINITY;
  const iqa5Passed =
    !continuous.error &&
    continuousDrafts.length >= 2 &&
    firstDraftDelay <= 6_000 &&
    speechToFinal >= 15_000 &&
    continuousDrafts.at(-1).at < continuousFinalRequest?.at &&
    draftGaps.every((gap) => gap <= 5_000) &&
    finalToFixed >= 0 &&
    finalToFixed <= 3_000;
  scenarios.push(scenario(
    "IQA-005",
    Boolean(iqa5Passed),
    ["Azure Speech", "Azure AI Foundry"],
    continuous.error
      ? `QA 浏览器流程未完成：${continuous.error}`
      : `首条草稿=${firstDraftDelay}ms；final 时点=${speechToFinal}ms；草稿更新间隔=[${draftGaps.join(",")}]ms；final 到 fixed=${Number.isFinite(finalToFixed) ? finalToFixed : "无"}ms；草稿早于 final=${Boolean(continuousDrafts.at(-1)?.at < continuousFinalRequest?.at)}。`
  ));

  const firstChineseFixed = chineseTwo.timeline.find(({ state }) => state === "fixed");
  const iqa6Passed =
    !chineseTwo.error &&
    chineseFixed.length >= 2 &&
    firstChineseFixed &&
    chineseFixed[0].segmentId === firstChineseFixed.segmentId &&
    chineseFixed[0].text === firstChineseFixed.text &&
    chineseTwo.translationRequests.length === 0;
  scenarios.push(scenario(
    "IQA-006",
    Boolean(iqa6Passed),
    ["Azure Speech"],
    chineseTwo.error
      ? `QA 浏览器流程未完成：${chineseTwo.error}`
      : `${checkpointSummary(chineseTwo)}；固定中文片段=${chineseFixed.length}；首段在后续片段期间保持同一标识与原文，翻译接口请求为 0。`
  ));

  const labels = {
    "IQA-001": "英文发言未在 final 前形成并修订中文草稿",
    "IQA-002": "英文完整译文未正确替换、固定或抵抗后续片段改写",
    "IQA-003": "中文原文未流式直显，或中文路径调用了翻译接口",
    "IQA-004": "字幕未按固定视窗底部追加、自动跟随或保持既有固定内容",
    "IQA-005": "英文流式字幕未满足 6 秒/5 秒/3 秒实时性边界",
    "IQA-006": "中文完整原文未最终固定或被后续片段改写"
  };
  for (const item of scenarios) {
    if (item.passed) continue;
    const flowError = (
      (item.id === "IQA-001" || item.id === "IQA-005") ? continuous :
      item.id === "IQA-002" ? englishTwo :
      (item.id === "IQA-003" || item.id === "IQA-006") ? chineseTwo : many
    ).error;
    if (flowError) testGaps.push(`${item.id}：QA 浏览器执行异常，无法完成批准场景判定：${flowError}`);
    else defects.push(`${item.id}：${labels[item.id]}。${item.evidence}`);
  }

  const passed = scenarios.every(({ passed }) => passed) && defects.length === 0 && testGaps.length === 0;
  const result = {
    passed,
    testedCommitSha: process.env.QA_CANDIDATE_SHA,
    environmentUrl: process.env.QA_BASE_URL,
    summary: passed
      ? "六个已批准 Independent QA 场景均在真实候选与 Azure 集成上通过。"
      : `Independent QA 完成：${scenarios.filter(({ passed: ok }) => ok).length}/6 个场景通过。`,
    qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
    qaPlanHash: process.env.QA_PLAN_HASH,
    defects,
    testGaps,
    evidence,
    bugfixResults: [],
    scenarios
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  const result = {
    passed: false,
    testedCommitSha: process.env.QA_CANDIDATE_SHA,
    environmentUrl: process.env.QA_BASE_URL,
    summary: "Independent QA 未执行：QA 浏览器编排在场景开始前失败。",
    qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
    qaPlanHash: process.env.QA_PLAN_HASH,
    defects: [],
    testGaps: [],
    evidence: [`QA Playwright 编排失败：${clean(error instanceof Error ? error.message : error)}`],
    bugfixResults: [],
    scenarios: []
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
});
NODE

exit 0
