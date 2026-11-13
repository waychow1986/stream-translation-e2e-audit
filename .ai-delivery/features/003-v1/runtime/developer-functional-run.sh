#!/usr/bin/env bash
set -euo pipefail

: "${DEV_FUNCTIONAL_BASE_URL:?DEV_FUNCTIONAL_BASE_URL is required}"
: "${DEV_FUNCTIONAL_RESULT_PATH:?DEV_FUNCTIONAL_RESULT_PATH is required}"
: "${AIDELIVERY_DELIVERY_ID:?AIDELIVERY_DELIVERY_ID is required}"
: "${AIDELIVERY_CANDIDATE_SHA:?AIDELIVERY_CANDIDATE_SHA is required}"

base="${DEV_FUNCTIONAL_BASE_URL%/}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

identity="$(curl --fail --silent --show-error "$base/candidate-identity")"
jq -e --arg delivery "$AIDELIVERY_DELIVERY_ID" --arg sha "$AIDELIVERY_CANDIDATE_SHA" \
  '.deliveryId == $delivery and .candidateSha == $sha' <<<"$identity" >/dev/null

curl --fail --silent --show-error \
  -H "Origin: $base" \
  -H "Content-Type: application/json" \
  --data '{"segmentId":"functional-1","revision":1,"mode":"final","sourceLanguage":"en-US","text":"Hello, welcome to the meeting."}' \
  "$base/api/translations" >"$work/translation.ndjson"

jq -e -s '
  (map(select(.type == "delta") | .text) | join("") | length > 0) and
  (map(select(.type == "completed")) | length == 1) and
  (map(select(.type == "error")) | length == 0)
' "$work/translation.ndjson" >/dev/null

jq -n \
  '{
    passed: true,
    scenarios: [{
      id: "DEV-FUNC-001",
      passed: true,
      externalServices: ["Azure AI Foundry"],
      evidence: "真实候选环境返回流式中文 delta，并以 completed 结束；候选身份与注入值一致。"
    }],
    evidence: ["已通过同源翻译接口执行真实 Foundry 流式请求，未记录会议正文或访问令牌。"]
  }' >"$DEV_FUNCTIONAL_RESULT_PATH"
