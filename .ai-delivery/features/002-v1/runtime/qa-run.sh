#!/usr/bin/env bash
set -uo pipefail

: "${QA_DELIVERY_ID:?QA_DELIVERY_ID is required}"
: "${QA_CANDIDATE_SHA:?QA_CANDIDATE_SHA is required}"
: "${QA_BASE_URL:?QA_BASE_URL is required}"
: "${QA_HEALTH_PATH:?QA_HEALTH_PATH is required}"
: "${QA_PLAN_COMMIT_SHA:?QA_PLAN_COMMIT_SHA is required}"
: "${QA_PLAN_HASH:?QA_PLAN_HASH is required}"
: "${QA_RESULT_PATH:?QA_RESULT_PATH is required}"

base_url="${QA_BASE_URL%/}"
health_path="${QA_HEALTH_PATH}"
[[ "${health_path}" == /* ]] || health_path="/${health_path}"
health_url="${base_url}${health_path}"
identity_url="${base_url}/candidate-identity"
temp_dir="$(mktemp -d)"
audio_path="${temp_dir}/iqa-en-multisegment.wav"
export QA_AUDIO_PATH="${audio_path}"
trap 'rm -rf "${temp_dir}"' EXIT

write_environment_failure() {
  local diagnostic="$1"
  QA_ENV_DIAGNOSTIC="${diagnostic}" node <<'NODE'
const fs = require("node:fs");
const result = {
  passed: false,
  testedCommitSha: process.env.QA_CANDIDATE_SHA,
  environmentUrl: process.env.QA_BASE_URL,
  summary: "Independent QA 因执行环境未就绪而未开始功能验收。",
  qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
  qaPlanHash: process.env.QA_PLAN_HASH,
  defects: [],
  testGaps: [],
  evidence: [process.env.QA_ENV_DIAGNOSTIC],
  bugfixResults: [],
  scenarios: []
};
fs.writeFileSync(process.env.QA_RESULT_PATH, JSON.stringify(result, null, 2), "utf8");
NODE
}

ready=false
last_diagnostic="候选尚未接受检查。"
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  health_body="$(curl --silent --show-error --fail --max-time 10 "${health_url}" 2>"${temp_dir}/health-error" || true)"
  if ! node -e '
    const value = JSON.parse(process.argv[1]);
    if (value.status !== "ok") process.exit(1);
  ' "${health_body}" 2>/dev/null; then
    last_diagnostic="候选健康检查尚未就绪：$(tr '\n' ' ' < "${temp_dir}/health-error" | cut -c1-300)"
    sleep 5
    continue
  fi

  identity_body="$(curl --silent --show-error --fail --max-time 10 "${identity_url}" 2>"${temp_dir}/identity-error" || true)"
  if QA_IDENTITY_BODY="${identity_body}" node -e '
    const value = JSON.parse(process.env.QA_IDENTITY_BODY);
    if (value.deliveryId !== process.env.QA_DELIVERY_ID ||
        value.candidateSha !== process.env.QA_CANDIDATE_SHA) process.exit(1);
  ' 2>/dev/null; then
    ready=true
    break
  fi
  last_diagnostic="候选身份端点未返回平台指定的 deliveryId 与 candidateSha：$(tr '\n' ' ' < "${temp_dir}/identity-error" | cut -c1-300)"
  sleep 5
done

if [[ "${ready}" != true ]]; then
  write_environment_failure "五分钟内 DNS、TLS、health 或不可变候选身份未就绪。${last_diagnostic}"
  exit 0
fi

if [[ -z "${AZURE_SPEECH_ENDPOINT:-}" ]]; then
  write_environment_failure "测试素材生成前置失败：QA 环境未提供 AZURE_SPEECH_ENDPOINT。"
  exit 0
fi

speech_token="$(az account get-access-token \
  --resource "https://cognitiveservices.azure.com/" \
  --query accessToken -o tsv 2>"${temp_dir}/token-error" || true)"
if [[ -z "${speech_token}" ]]; then
  write_environment_failure "测试素材生成前置失败：QA OIDC 身份无法取得 Azure Speech token。$(tr '\n' ' ' < "${temp_dir}/token-error" | cut -c1-300)"
  exit 0
fi

cat > "${temp_dir}/speech.ssml" <<'SSML'
<speak version="1.0" xml:lang="en-US">
  <voice name="en-US-AvaNeural">
    The first topic is the project plan.
    <break time="5000ms"/>
    The second topic is the budget for the year twenty twenty-seven.
  </voice>
</speak>
SSML

tts_url="${AZURE_SPEECH_ENDPOINT%/}/cognitiveservices/v1"
if ! curl --silent --show-error --fail --max-time 60 \
  -X POST "${tts_url}" \
  --oauth2-bearer "${speech_token}" \
  -H "Content-Type: application/ssml+xml" \
  -H "X-Microsoft-OutputFormat: riff-16khz-16bit-mono-pcm" \
  --data-binary "@${temp_dir}/speech.ssml" \
  --output "${audio_path}" 2>"${temp_dir}/tts-error"; then
  write_environment_failure "测试素材生成前置失败：Azure Speech TTS 未生成合成 WAV。$(tr '\n' ' ' < "${temp_dir}/tts-error" | cut -c1-300)"
  exit 0
fi
unset speech_token

node <<'NODE'
const fs = require("node:fs");
const { chromium } = require("@playwright/test");

const resultPath = process.env.QA_RESULT_PATH;
const baseUrl = process.env.QA_BASE_URL.replace(/\/$/, "");
const audioPath = process.env.QA_AUDIO_PATH;

function baseResult() {
  return {
    passed: false,
    testedCommitSha: process.env.QA_CANDIDATE_SHA,
    environmentUrl: process.env.QA_BASE_URL,
    summary: "",
    qaPlanCommitSha: process.env.QA_PLAN_COMMIT_SHA,
    qaPlanHash: process.env.QA_PLAN_HASH,
    defects: [],
    testGaps: [],
    evidence: [],
    bugfixResults: [],
    scenarios: []
  };
}

function wavSpeechGroups(path) {
  const wav = fs.readFileSync(path);
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("TTS output is not a RIFF/WAVE file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let pcm;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      channels = wav.readUInt16LE(start + 2);
      sampleRate = wav.readUInt32LE(start + 4);
      bits = wav.readUInt16LE(start + 14);
    } else if (id === "data") {
      pcm = wav.subarray(start, start + length);
    }
    offset = start + length + (length % 2);
  }
  if (!pcm || sampleRate !== 16000 || channels !== 1 || bits !== 16) {
    throw new Error(`Unexpected WAV format: ${sampleRate}Hz/${channels}ch/${bits}bit`);
  }
  const samplesPerWindow = Math.floor(sampleRate * 0.02);
  const active = [];
  for (let sample = 0; sample < pcm.length / 2; sample += samplesPerWindow) {
    let peak = 0;
    const end = Math.min(sample + samplesPerWindow, pcm.length / 2);
    for (let index = sample; index < end; index++) {
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(index * 2)));
    }
    if (peak > 300) active.push(sample);
  }
  const groups = [];
  for (const sample of active) {
    const previous = groups.at(-1);
    if (!previous || sample - previous.end > sampleRate) {
      groups.push({ start: sample, end: sample });
    } else {
      previous.end = sample;
    }
  }
  if (groups.length < 2) throw new Error("Synthetic WAV does not contain two separated speech groups");
  return groups;
}

function containsHan(value) {
  return /\p{Script=Han}/u.test(value);
}

function compact(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

(async () => {
  const result = baseResult();
  let browser;
  let pageReached = false;
  try {
    const groups = wavSpeechGroups(audioPath);
    const launchArgs = [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}`
    ];
    if (baseUrl.startsWith("http://")) {
      launchArgs.push(`--unsafely-treat-insecure-origin-as-secure=${baseUrl}`);
    }
    browser = await chromium.launch({ headless: true, args: launchArgs });
    const context = await browser.newContext({ permissions: ["microphone"] });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      window.__qa = { audioSamples: 0, events: [] };
      class QAWebSocket extends NativeWebSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (message) => {
            try {
              const event = JSON.parse(String(message.data));
              window.__qa.events.push({
                ...event,
                observedAudioSamples: window.__qa.audioSamples
              });
            } catch {}
          });
        }
        send(data) {
          if (data instanceof ArrayBuffer) window.__qa.audioSamples += data.byteLength / 2;
          return super.send(data);
        }
      }
      window.WebSocket = QAWebSocket;
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    pageReached = true;
    const languageControls = await page.locator("select, [role=combobox]").count();
    await page.getByRole("button", { name: "开始翻译" }).click();
    await page.getByTestId("status").filter({ hasText: "正在聆听" }).waitFor();

    const subtitles = page.getByTestId("subtitle");
    await subtitles.first().waitFor();
    const firstObserved = await page.evaluate(() => ({
      samples: window.__qa.audioSamples,
      text: document.querySelector('[data-testid="subtitle"]')?.textContent || ""
    }));

    const secondSpeechProofSample = groups[1].start + 8000;
    await page.waitForFunction(
      (sample) => window.__qa.audioSamples >= sample &&
        document.querySelectorAll('[data-testid="subtitle"]').length >= 1,
      secondSpeechProofSample
    );
    const duringSecond = await page.evaluate(() => ({
      samples: window.__qa.audioSamples,
      subtitles: Array.from(document.querySelectorAll('[data-testid="subtitle"]'))
        .map((item) => item.textContent || "")
    }));

    await page.waitForFunction(() =>
      document.querySelectorAll('[data-testid="subtitle"]').length >= 2 &&
      window.__qa.events.filter((event) => event.type === "dependency.evidence").length >= 2
    );
    await page.getByRole("button", { name: "停止翻译" }).click();
    await page.getByTestId("status").filter({ hasText: "已停止" }).waitFor();

    const observation = await page.evaluate(() => ({
      audioSamples: window.__qa.audioSamples,
      events: window.__qa.events,
      subtitles: Array.from(document.querySelectorAll('[data-testid="subtitle"]'))
        .map((item) => item.textContent || ""),
      detectedLanguage: document.querySelector('[data-testid="detected-language"]')?.textContent || "",
      acceptanceComplete: document.querySelector('[data-testid="acceptance"]')?.getAttribute("data-complete")
    }));

    const finalEvents = observation.events.filter((event) => event.type === "subtitle.final");
    const speechEvents = observation.events.filter((event) => event.type === "speech.final");
    const dependencyEvents = observation.events.filter((event) => event.type === "dependency.evidence");
    const firstText = compact(observation.subtitles[0] || "");
    const secondText = compact(observation.subtitles[1] || "");
    const firstMeaning = /项目/.test(firstText) && /计划/.test(firstText);
    const secondMeaning = /预算/.test(secondText) &&
      /(2027|二[〇零○]二七|两千零二十七)/.test(secondText);
    const laterInputWhileFirstVisible =
      duringSecond.samples >= secondSpeechProofSample &&
      compact(duringSecond.subtitles[0] || "") === firstText;
    const chineseOutput = observation.subtitles.length >= 2 &&
      observation.subtitles.every(containsHan);
    const englishDetected = speechEvents.length >= 2 &&
      speechEvents.every((event) => /^en(?:-|$)/i.test(event.detectedLanguage));
    const chineseTarget = finalEvents.length >= 2 &&
      finalEvents.every((event) => event.targetLanguage === "zh-CN");
    const evidenceBySegment = finalEvents.length >= 2 &&
      finalEvents.every((subtitle) => dependencyEvents.some((evidence) =>
        evidence.segmentId === subtitle.segmentId &&
        typeof evidence.speechResultId === "string" && evidence.speechResultId.length > 0 &&
        typeof evidence.modelRequestId === "string" && evidence.modelRequestId.length > 0 &&
        !evidence.speechResultId.includes("test-double:") &&
        !evidence.modelRequestId.includes("test-double:")
      ));

    const iqa1 = laterInputWhileFirstVisible && firstMeaning && secondMeaning;
    const iqa2 = languageControls === 0 && englishDetected && chineseTarget && chineseOutput;
    const iqa3 = iqa1 && iqa2 && evidenceBySegment && observation.acceptanceComplete === "true";

    result.scenarios = [
      {
        id: "IQA-001",
        passed: iqa1,
        externalServices: ["Azure AI Speech", "Azure AI Foundry"],
        evidence: `第一字幕出现于 PCM 样本 ${firstObserved.samples}；第二语音段开始于样本 ${groups[1].start}，样本 ${duringSecond.samples} 时第一字幕仍可见；最终前两条字幕依次为“${firstText}”与“${secondText}”。`
      },
      {
        id: "IQA-002",
        passed: iqa2,
        externalServices: ["Azure AI Speech", "Azure AI Foundry"],
        evidence: `语言选择控件数量 ${languageControls}；Speech 检测值 ${speechEvents.map((event) => event.detectedLanguage).join(", ")}；字幕目标值 ${finalEvents.map((event) => event.targetLanguage).join(", ")}；可见字幕均含中文=${chineseOutput}。`
      },
      {
        id: "IQA-003",
        passed: iqa3,
        externalServices: ["Azure AI Speech", "Azure AI Foundry"],
        evidence: `同一浏览器会话取得 ${speechEvents.length} 个 speech.final、${finalEvents.length} 个 subtitle.final 和 ${dependencyEvents.length} 个 dependency.evidence；逐 segment 真实依赖关联=${evidenceBySegment}，页面完整标记=${observation.acceptanceComplete}。`
      }
    ];

    if (!iqa1) result.defects.push("IQA-001 失败：未同时观察到第二语义片段输入期间首条中文字幕可见，或最终字幕未按顺序表达“项目计划”和“2027 年预算”。");
    if (!iqa2) result.defects.push("IQA-002 失败：英语自动检测、无需手动选语言、中文目标或可见中文结果至少一项不符合 AC-002。");
    if (!iqa3) result.defects.push("IQA-003 失败：完整流程未满足全部验收行为，或字幕片段缺少可关联的真实 Speech/Foundry 非测试替身证据。");
    result.passed = result.defects.length === 0 &&
      result.testGaps.length === 0 &&
      result.scenarios.every((scenario) => scenario.passed);
    result.summary = result.passed
      ? "IQA-001 至 IQA-003 均通过，真实英语语音到流式中文字幕完整流程验收成功。"
      : "Independent QA 已完成，候选存在未通过的已批准验收场景。";
    result.evidence = [
      `候选 health 与 identity 前置检查通过：deliveryId=${process.env.QA_DELIVERY_ID}，candidateSha=${process.env.QA_CANDIDATE_SHA}。`,
      `Azure Speech TTS 合成 WAV 为 16 kHz 单声道 PCM，识别到 ${groups.length} 个分离语音段；Playwright 经 Chromium fake microphone 执行黑盒流程。`,
      `浏览器累计发送 ${observation.audioSamples} 个 16 kHz PCM 样本，记录 ${observation.events.length} 个服务端业务事件。`
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pageReached) {
      result.summary = "Independent QA 因 Playwright 执行环境未就绪而未开始功能验收。";
      result.evidence = [`Playwright 启动或访问候选前置失败：${message}`];
    } else {
      result.summary = "Independent QA 无法完成已批准的浏览器完整流程。";
      result.testGaps = [`IQA-001 至 IQA-003 的 Playwright 黑盒流程未完成：${message}`];
      result.scenarios = [
        { id: "IQA-001", passed: false, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: `浏览器流程中断：${message}` },
        { id: "IQA-002", passed: false, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: `浏览器流程中断：${message}` },
        { id: "IQA-003", passed: false, externalServices: ["Azure AI Speech", "Azure AI Foundry"], evidence: `浏览器流程中断：${message}` }
      ];
    }
  } finally {
    if (browser) await browser.close();
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  }
})().catch((error) => {
  const result = baseResult();
  result.summary = "Independent QA Runner 发生环境级异常。";
  result.evidence = [`Runner 异常：${error instanceof Error ? error.message : String(error)}`];
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
});
NODE

exit 0
