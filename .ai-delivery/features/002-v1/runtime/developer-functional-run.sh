#!/usr/bin/env bash
set -euo pipefail

result_path="${DEV_FUNCTIONAL_RESULT_PATH:-/tmp/developer-functional-result.json}"

if npx --no-install playwright test; then
  cat > "${result_path}" <<'JSON'
{"passed":true,"scenarios":[{"id":"DEV-FUNC-001","passed":true,"externalServices":[],"evidence":"Playwright 使用合成 PCM 与显式 deterministic adapter 验证手动开始、流式中文字幕顺序、英语自动检测、停止边界及反向失败判定。"}],"evidence":["本地功能流不构成真实 Azure Speech/Foundry 集成证据。"]}
JSON
else
  cat > "${result_path}" <<'JSON'
{"passed":false,"scenarios":[{"id":"DEV-FUNC-001","passed":false,"externalServices":[],"evidence":"Playwright 本地功能流失败。"}],"evidence":["检查 Playwright 输出。"]}
JSON
  exit 1
fi
