#!/usr/bin/env bash
set -uo pipefail

QA_DELIVERY_ID="${QA_DELIVERY_ID-}"
QA_CANDIDATE_SHA="${QA_CANDIDATE_SHA-}"
QA_BASE_URL="${QA_BASE_URL-}"
QA_HEALTH_PATH="${QA_HEALTH_PATH-}"
QA_PLAN_COMMIT_SHA="${QA_PLAN_COMMIT_SHA-}"
QA_PLAN_HASH="${QA_PLAN_HASH-}"
QA_RESULT_PATH="${QA_RESULT_PATH-}"

if [[ -z "$QA_RESULT_PATH" ]]; then
  echo "QA_RESULT_PATH is required" >&2
  exit 2
fi

write_environment_block() {
  local message="$1"
  QA_BLOCK_MESSAGE="$message" node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";

const result = {
  passed: false,
  testedCommitSha: process.env.QA_CANDIDATE_SHA ?? "",
  environmentUrl: process.env.QA_BASE_URL ?? "",
  summary: "Independent QA 未执行：候选环境或测试前置未就绪。",
  qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA ?? "",
  qaPlanHash: process.env.QA_PLAN_HASH ?? "",
  defects: [],
  testGaps: [],
  evidence: [process.env.QA_BLOCK_MESSAGE ?? "未提供环境诊断。"],
  bugfixResults: [],
  scenarios: []
};
writeFileSync(process.env.QA_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
NODE
}

missing=()
for name in QA_DELIVERY_ID QA_CANDIDATE_SHA QA_BASE_URL QA_HEALTH_PATH QA_PLAN_COMMIT_SHA QA_PLAN_HASH; do
  if [[ -z "${!name}" ]]; then missing+=("$name"); fi
done
if (( ${#missing[@]} > 0 )); then
  write_environment_block "缺少平台 QA 环境变量：${missing[*]}。"
  exit 0
fi

work_dir="$(mktemp -d /tmp/stream-translation-qa.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT

health_url="${QA_BASE_URL%/}/${QA_HEALTH_PATH#/}"
identity_url="${QA_BASE_URL%/}/candidate-identity"
ready=false
last_diagnostic="尚未请求候选。"
deadline=$((SECONDS + 300))

while (( SECONDS < deadline )); do
  health_status="$(curl --silent --show-error --connect-timeout 10 --max-time 15 \
    --output "$work_dir/health.json" --write-out '%{http_code}' "$health_url" \
    2>"$work_dir/health.err")"
  health_exit=$?
  identity_status="$(curl --silent --show-error --connect-timeout 10 --max-time 15 \
    --output "$work_dir/identity.json" --write-out '%{http_code}' "$identity_url" \
    2>"$work_dir/identity.err")"
  identity_exit=$?

  if [[ $health_exit -eq 0 && "$health_status" == "200" &&
        $identity_exit -eq 0 && "$identity_status" == "200" ]]; then
    if HEALTH_PATH="$work_dir/health.json" IDENTITY_PATH="$work_dir/identity.json" \
      node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const health = JSON.parse(readFileSync(process.env.HEALTH_PATH, "utf8"));
const identity = JSON.parse(readFileSync(process.env.IDENTITY_PATH, "utf8"));
process.exit(
  health.status === "ok" &&
  identity.deliveryId === process.env.QA_DELIVERY_ID &&
  identity.candidateSha === process.env.QA_CANDIDATE_SHA ? 0 : 1
);
NODE
    then
      ready=true
      break
    fi
    last_diagnostic="health HTTP ${health_status}；identity HTTP ${identity_status}，但 deliveryId 或 candidateSha 不匹配。"
  else
    health_error="$(tr '\n' ' ' < "$work_dir/health.err" | tail -c 300)"
    identity_error="$(tr '\n' ' ' < "$work_dir/identity.err" | tail -c 300)"
    last_diagnostic="health exit=${health_exit} HTTP=${health_status} ${health_error}；identity exit=${identity_exit} HTTP=${identity_status} ${identity_error}"
  fi
  sleep 5
done

if [[ "$ready" != "true" ]]; then
  write_environment_block "候选在五分钟内未通过 DNS/连接/TLS/health/不可变 identity 就绪校验：${last_diagnostic}"
  exit 0
fi

if [[ -z "${AZURE_SPEECH_ENDPOINT-}" ]] || ! command -v az >/dev/null 2>&1; then
  write_environment_block "测试前置失败：QA runner 未提供 AZURE_SPEECH_ENDPOINT 或 Azure CLI，无法合成批准的英语测试语音。"
  exit 0
fi

speech_token="$(az account get-access-token \
  --resource https://cognitiveservices.azure.com \
  --query accessToken --output tsv 2>"$work_dir/token.err")"
token_exit=$?
if [[ $token_exit -ne 0 || -z "$speech_token" ]]; then
  token_error="$(tr '\n' ' ' < "$work_dir/token.err" | tail -c 400)"
  write_environment_block "测试前置失败：无法使用 QA 托管身份取得 Azure Speech 令牌（exit=${token_exit}）：${token_error}"
  exit 0
fi

printf 'oauth2-bearer = "%s"\n' "$speech_token" > "$work_dir/speech-token.curl"
chmod 600 "$work_dir/speech-token.curl"
cat > "$work_dir/first.ssml" <<'EOF'
<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">Welcome to the meeting.</voice></speak>
EOF
cat > "$work_dir/second.ssml" <<'EOF'
<speak version="1.0" xml:lang="en-US"><voice name="en-US-JennyNeural">We will discuss the project.</voice></speak>
EOF

tts_url="${AZURE_SPEECH_ENDPOINT%/}/cognitiveservices/v1"
synthesize() {
  local ssml_path="$1"
  local wav_path="$2"
  curl --silent --show-error --connect-timeout 15 --max-time 90 \
    --config "$work_dir/speech-token.curl" \
    --request POST "$tts_url" \
    --header "Content-Type: application/ssml+xml" \
    --header "X-Microsoft-OutputFormat: riff-16khz-16bit-mono-pcm" \
    --header "User-Agent: AIDelivery-Independent-QA" \
    --data-binary "@$ssml_path" \
    --output "$wav_path" --write-out '%{http_code}'
}

first_status="$(synthesize "$work_dir/first.ssml" "$work_dir/first.wav" 2>"$work_dir/first.err")"
first_exit=$?
second_status="$(synthesize "$work_dir/second.ssml" "$work_dir/second.wav" 2>"$work_dir/second.err")"
second_exit=$?
rm -f "$work_dir/speech-token.curl"
unset speech_token

if [[ $first_exit -ne 0 || "$first_status" != "200" ||
      $second_exit -ne 0 || "$second_status" != "200" ]]; then
  first_error="$(tr '\n' ' ' < "$work_dir/first.err" | tail -c 250)"
  second_error="$(tr '\n' ' ' < "$work_dir/second.err" | tail -c 250)"
  write_environment_block "测试前置失败：Azure Speech TTS 合成未成功（first exit=${first_exit} HTTP=${first_status} ${first_error}；second exit=${second_exit} HTTP=${second_status} ${second_error}）。"
  exit 0
fi

QA_WORK_DIR="$work_dir" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.env.QA_WORK_DIR;
function readPcm(path) {
  const wav = readFileSync(path);
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} 不是 RIFF/WAVE`);
  }
  let offset = 12;
  let format;
  let pcm;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: wav.readUInt16LE(body),
        channels: wav.readUInt16LE(body + 2),
        sampleRate: wav.readUInt32LE(body + 4),
        byteRate: wav.readUInt32LE(body + 8),
        blockAlign: wav.readUInt16LE(body + 12),
        bitsPerSample: wav.readUInt16LE(body + 14)
      };
    } else if (id === "data") {
      pcm = wav.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!format || !pcm || format.audioFormat !== 1 || format.channels !== 1 ||
      format.sampleRate !== 16000 || format.bitsPerSample !== 16) {
    throw new Error(`${path} 的 PCM 格式不是 16 kHz/mono/16-bit`);
  }
  return { format, pcm };
}

const first = readPcm(join(directory, "first.wav"));
const second = readPcm(join(directory, "second.wav"));
const interSilenceMs = 2500;
const trailingSilenceMs = 1800;
const bytesPerMs = first.format.byteRate / 1000;
const interSilence = Buffer.alloc(Math.round(interSilenceMs * bytesPerMs));
const trailingSilence = Buffer.alloc(Math.round(trailingSilenceMs * bytesPerMs));
const data = Buffer.concat([first.pcm, interSilence, second.pcm, trailingSilence]);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(16000, 24);
header.writeUInt32LE(32000, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(join(directory, "iqa.wav"), Buffer.concat([header, data]));

const firstMs = first.pcm.length / bytesPerMs;
const secondMs = second.pcm.length / bytesPerMs;
writeFileSync(join(directory, "audio-metadata.json"), JSON.stringify({
  firstMs,
  secondMs,
  interSilenceMs,
  trailingSilenceMs,
  secondStartFrame: Math.floor((firstMs + interSilenceMs) / 20),
  secondMiddleFrame: Math.floor((firstMs + interSilenceMs + secondMs / 2) / 20),
  audioEndFrame: Math.floor((firstMs + interSilenceMs + secondMs + trailingSilenceMs) / 20)
}));
NODE
combine_exit=$?
if [[ $combine_exit -ne 0 ]]; then
  write_environment_block "测试前置失败：无法将 Azure Speech 合成结果构造成 16 kHz 单声道 PCM 验收素材。"
  exit 0
fi

QA_AUDIO_PATH="$work_dir/iqa.wav" \
QA_AUDIO_METADATA_PATH="$work_dir/audio-metadata.json" \
node --input-type=module <<'NODE'
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const baseURL = process.env.QA_BASE_URL;
const metadata = JSON.parse(readFileSync(process.env.QA_AUDIO_METADATA_PATH, "utf8"));
const observations = {
  audioFrames: 0,
  sentControl: [],
  serverEvents: [],
  console: [],
  networkErrors: [],
  firstSubtitleAtSecondMiddle: "",
  status: "",
  selectCount: -1,
  subtitles: []
};
const stamp = () => new Date().toISOString();
const waitUntil = async (predicate, timeoutMs, intervalMs = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
};
const includesConcepts = (text, concepts) => concepts.every((concept) => text.includes(concept));
const concise = (items, limit = 8) => items.slice(-limit).join(" | ");

let browser;
let page;
let executionStarted = false;
let infrastructureFailure = "";
let scriptGap = "";

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${process.env.QA_AUDIO_PATH}`,
      `--unsafely-treat-insecure-origin-as-secure=${baseURL}`
    ]
  });
  const context = await browser.newContext({ permissions: ["microphone"] });
  await context.grantPermissions(["microphone"], { origin: new URL(baseURL).origin });
  page = await context.newPage();
  page.on("console", (message) => observations.console.push(`${stamp()} ${message.type()}: ${message.text()}`));
  page.on("requestfailed", (request) => observations.networkErrors.push(
    `${stamp()} ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`
  ));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      observations.networkErrors.push(`${stamp()} ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload === "string") {
        observations.sentControl.push(`${stamp()} ${payload.slice(0, 500)}`);
      } else {
        observations.audioFrames++;
      }
    });
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string") return;
      try {
        const event = JSON.parse(payload);
        observations.serverEvents.push({ at: stamp(), frame: observations.audioFrames, ...event });
      } catch {
        observations.serverEvents.push({ at: stamp(), frame: observations.audioFrames, type: "invalid-json" });
      }
    });
    socket.on("socketerror", (error) => observations.networkErrors.push(`${stamp()} WebSocket ${error}`));
  });

  const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!response || !response.ok()) throw new Error(`页面响应状态 ${response?.status() ?? "none"}`);
  observations.selectCount = await page.locator("select").count();
  await page.getByRole("button", { name: "开始翻译" }).click();
  executionStarted = true;

  await waitUntil(async () => observations.audioFrames > 0 ||
    (await page.getByTestId("status").textContent())?.includes("失败"), 30000);

  await waitUntil(() => observations.audioFrames >= metadata.secondMiddleFrame, 90000);
  const middleSubtitles = await page.locator('[data-testid="subtitle"]').allTextContents();
  observations.firstSubtitleAtSecondMiddle = middleSubtitles[0] ?? "";

  await waitUntil(() => observations.audioFrames >= metadata.audioEndFrame, 90000);
  await waitUntil(() => observations.serverEvents.filter((event) => event.type === "subtitle.final").length >= 2, 60000);
  observations.subtitles = await page.locator('[data-testid="subtitle"]').allTextContents();
  observations.status = (await page.getByTestId("status").textContent()) ?? "";

  const stop = page.getByRole("button", { name: "停止翻译" });
  if (await stop.isEnabled().catch(() => false)) {
    await stop.click();
    await waitUntil(() => observations.serverEvents.some((event) => event.type === "session.stopped") ||
      observations.serverEvents.some((event) => event.type === "session.failed"), 30000);
    observations.status = (await page.getByTestId("status").textContent()) ?? observations.status;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (executionStarted) scriptGap = `Playwright 在验收流程执行中异常：${message}`;
  else infrastructureFailure = `Playwright 无法启动或访问候选页面：${message}`;
} finally {
  await browser?.close().catch(() => undefined);
}

if (infrastructureFailure) {
  writeFileSync(process.env.QA_RESULT_PATH, `${JSON.stringify({
    passed: false,
    testedCommitSha: process.env.QA_CANDIDATE_SHA,
    environmentUrl: baseURL,
    summary: "Independent QA 未执行：浏览器执行环境或候选页面不可用。",
    qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
    qaPlanHash: process.env.QA_PLAN_HASH,
    defects: [],
    testGaps: [],
    evidence: [infrastructureFailure],
    bugfixResults: [],
    scenarios: []
  }, null, 2)}\n`, "utf8");
  process.exit(0);
}

const events = observations.serverEvents;
const speechEvents = events.filter((event) => event.type === "speech.final");
const deltaEvents = events.filter((event) => event.type === "subtitle.delta");
const finalEvents = events.filter((event) => event.type === "subtitle.final");
const dependencyEvents = events.filter((event) => event.type === "dependency.evidence");
const failureEvents = events.filter((event) => event.type === "session.failed");
const targetLanguages = [...deltaEvents, ...finalEvents].map((event) => event.targetLanguage);
const detectedEnglish = speechEvents.some((event) => /^en(?:-|$)/i.test(String(event.detectedLanguage)));
const realDependencyEvidence = dependencyEvents.length >= 2 && dependencyEvents.every((event) =>
  event.speechResultId && event.modelRequestId &&
  !String(event.speechResultId).startsWith("test-double:") &&
  !String(event.modelRequestId).startsWith("test-double:")
);
const firstMeaning = includesConcepts(observations.subtitles[0] ?? "", ["欢迎", "会议"]);
const secondMeaning = includesConcepts(observations.subtitles[1] ?? "", ["讨论", "项目"]);
const firstVisibleDuringSecond = includesConcepts(observations.firstSubtitleAtSecondMiddle, ["欢迎", "会议"]);
const audioAndRequest = observations.audioFrames > 0 &&
  observations.sentControl.some((entry) => entry.includes('"type":"start"'));
const allChineseTarget = targetLanguages.length > 0 && targetLanguages.every((language) => language === "zh-CN");
const noLanguageSelector = observations.selectCount === 0;
const noSessionFailure = failureEvents.length === 0;

const scenario1Passed = audioAndRequest && firstVisibleDuringSecond && firstMeaning && secondMeaning &&
  deltaEvents.length > 0 && finalEvents.length >= 2 && noSessionFailure;
const scenario2Passed = noLanguageSelector && detectedEnglish && allChineseTarget &&
  firstMeaning && secondMeaning && noSessionFailure;
const scenario3Passed = scenario1Passed && scenario2Passed && realDependencyEvidence;

const services = [];
if (speechEvents.length > 0) services.push("Azure AI Speech");
if (dependencyEvents.length > 0 || finalEvents.length > 0) services.push("Azure AI Foundry");

const scenarios = [
  {
    id: "IQA-001",
    passed: scenario1Passed,
    externalServices: services,
    evidence: `音频帧=${observations.audioFrames}，第二段中点帧=${metadata.secondMiddleFrame}，中点可见首字幕=${JSON.stringify(observations.firstSubtitleAtSecondMiddle)}，最终字幕=${JSON.stringify(observations.subtitles)}，speech.final=${speechEvents.length}，delta=${deltaEvents.length}，final=${finalEvents.length}。`
  },
  {
    id: "IQA-002",
    passed: scenario2Passed,
    externalServices: services,
    evidence: `语言选择控件=${observations.selectCount}，检测语言=${JSON.stringify(speechEvents.map((event) => event.detectedLanguage))}，目标语言=${JSON.stringify(targetLanguages)}，中文字幕=${JSON.stringify(observations.subtitles)}。`
  },
  {
    id: "IQA-003",
    passed: scenario3Passed,
    externalServices: services,
    evidence: `start已发送=${audioAndRequest}，实际依赖关联数=${dependencyEvents.length}，非test-double关联=${realDependencyEvidence}，会话失败=${JSON.stringify(failureEvents.map((event) => event.code))}，页面状态=${JSON.stringify(observations.status)}。`
  }
];

const defects = [];
if (!scenario1Passed) {
  defects.push(`IQA-001 未满足持续字幕：采集帧=${observations.audioFrames}，第二段播放中点的首字幕=${JSON.stringify(observations.firstSubtitleAtSecondMiddle)}，最终字幕=${JSON.stringify(observations.subtitles)}。`);
}
if (!scenario2Passed) {
  defects.push(`IQA-002 未满足自动英语检测到中文：select=${observations.selectCount}，检测语言=${JSON.stringify(speechEvents.map((event) => event.detectedLanguage))}，目标语言=${JSON.stringify(targetLanguages)}。`);
}
if (!scenario3Passed) {
  defects.push(`IQA-003 完整实际依赖流程未成立：Speech事件=${speechEvents.length}，Foundry/关联证据=${dependencyEvents.length}，失败码=${JSON.stringify(failureEvents.map((event) => event.code))}。`);
}
const testGaps = scriptGap ? [scriptGap] : [];
const passed = scenarios.every((scenario) => scenario.passed) && defects.length === 0 && testGaps.length === 0;
const evidence = [
  `候选 health 与 identity 已校验；测试语音由 QA 托管身份调用 Azure Speech TTS 合成，片段时长 first=${Math.round(metadata.firstMs)}ms、second=${Math.round(metadata.secondMs)}ms。`,
  `流程检查点：采集音频帧=${observations.audioFrames}；客户端控制消息=${observations.sentControl.length}；Speech返回=${speechEvents.length}；字幕delta/final=${deltaEvents.length}/${finalEvents.length}；页面字幕=${observations.subtitles.length}。`,
  `WebSocket事件摘要：${concise(events.map((event) => `${event.at} frame=${event.frame} ${event.type}${event.code ? `/${event.code}` : ""}`), 16) || "无服务端事件"}`,
  `浏览器控制台摘要：${concise(observations.console) || "无控制台消息"}`,
  `网络错误摘要：${concise(observations.networkErrors) || "无失败请求"}`
];

writeFileSync(process.env.QA_RESULT_PATH, `${JSON.stringify({
  passed,
  testedCommitSha: process.env.QA_CANDIDATE_SHA,
  environmentUrl: baseURL,
  summary: passed
    ? "IQA-001 至 IQA-003 均通过，英语到中文实时流式翻译完整流程使用实际依赖成立。"
    : "Independent QA 发现已批准场景失败或执行覆盖缺口，详见 defects、testGaps 与场景证据。",
  qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
  qaPlanHash: process.env.QA_PLAN_HASH,
  defects,
  testGaps,
  evidence,
  bugfixResults: [],
  scenarios
}, null, 2)}\n`, "utf8");
NODE

browser_exit=$?
if [[ $browser_exit -ne 0 || ! -s "$QA_RESULT_PATH" ]]; then
  write_environment_block "测试前置失败：Playwright 执行进程异常退出（exit=${browser_exit}），未形成可用验收结果。"
fi

exit 0
