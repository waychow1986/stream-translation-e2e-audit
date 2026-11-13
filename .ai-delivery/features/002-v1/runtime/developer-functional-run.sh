#!/usr/bin/env bash
set -euo pipefail

result_path="${DEV_FUNCTIONAL_RESULT_PATH:-/tmp/developer-functional-result.json}"

if npx --no-install playwright test; then
  cat > "${result_path}" <<'JSON'
{"passed":true,"scenarios":[{"id":"DEV-FUNC-001","passed":true,"externalServices":[],"evidence":"Playwright 通过 Chromium fake microphone 播放已提交合成 WAV，经 getUserMedia 与 AudioWorklet 验证手动开始、逐帧输入期间的渐进中文字幕、英语自动检测、停止边界及应用实际不合格输出的反向判定。"}],"evidence":["本地功能流使用显式 deterministic adapter，不构成真实 Azure Speech/Foundry 集成证据。"]}
JSON
else
  cat > "${result_path}" <<'JSON'
{"passed":false,"scenarios":[{"id":"DEV-FUNC-001","passed":false,"externalServices":[],"evidence":"Playwright 本地功能流失败。"}],"evidence":["检查 Playwright 输出。"]}
JSON
  exit 1
fi
