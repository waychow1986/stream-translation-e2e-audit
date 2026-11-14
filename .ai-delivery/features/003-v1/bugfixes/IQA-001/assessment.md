# IQA-001 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-001
- **QA Run ID：** 本次 Independent QA（关联 `NR-DLV-20261113-BCCA3652FB86-0039`，未提供独立 Run ID）
- **Candidate SHA：** `8f23a795b014acf174497f1c11b5641f1de2739c`
- **环境：** `http://20.7.107.68`

## 问题报告

英文会话虽成功启动并取得 Speech token，但未建立 Speech WebSocket、未发送任何音频帧，因而 final 前没有形成或修订中文草稿。

## 预期与实际行为

预期英文发言在最终确认前产生并至少修订一次中文草稿。实际 Speech token 返回 `200`，但 WebSocket 与帧数均为 0、翻译请求为 0，观察到 0 次不同中文草稿。

## 复现步骤与证据

在候选环境允许媒体采集，播放 QA 通过真实 Azure Speech TTS 合成的英文 WAV 并启动会话。会话启动为 `true`、token HTTP 为 `200`，随后浏览器控制台唯一错误指向连接 `wss://eastus2.stt.speech.microsoft.com/...`；网络记录中没有 Speech WebSocket。该地址与应用 CSP 仅允许的配置端点 origin 不同。

## 影响追踪

影响 `US-001`、`US-002`、`FR-001`、`FR-004`、`FR-005`、`NFR-001`、`SC-001`、`AC-001`、`AC-002`、场景 `IQA-001`，以及实现任务 `T004`、`T009`、`T011`、`T012`、`T015`、`T019`。

## 根因分析

`src/server/security.ts` 从 `AZURE_SPEECH_ENDPOINT` 只生成该自定义资源 origin 的 HTTPS/WSS `connect-src`。Azure Speech SDK 实际将识别连接导向区域服务 `wss://eastus2.stt.speech.microsoft.com`，不在 CSP 允许列表内，浏览器在 WebSocket 建立及音频发送前阻止连接。现有 `tests/contract/security.test.ts` 只检查同源与日志脱敏，没有验证生产 CSP 能允许 SDK 的实际区域 WSS 地址，因此该缺陷未被候选检查发现。沿调用链检查后，token 获取已成功，翻译和字幕逻辑均尚未被执行；当前证据不支持把下游零请求另判为独立根因。

## 限定范围的修复方案

仅修正生产 CSP 的 Speech `connect-src`，允许 Azure Speech SDK 实际使用的受限区域 STT WSS 目标，同时保留同源 API及其余 CSP 限制；补充安全 contract 测试覆盖配置端点与实际 SDK WSS 连接目标。不得增加测试专用产品接口。

## 回归风险

放宽过度会扩大浏览器出站连接面；限制过窄或区域写死会在其他部署区域再次阻断。回归需验证 CSP 安全边界、真实 Speech WebSocket/音频帧、英文 interim、翻译草稿及会话清理。

## 未解决证据

CSP 修复前无法执行 Speech 识别后的翻译调度和 UI 路径；修复后必须在同一真实候选环境重跑本场景，确认草稿首现和至少一次修订，且检查是否存在被当前阻塞掩盖的下游产品缺陷。

## 分类与修复就绪决策

- **classification：** `product_defect`
- **ready_for_fix：** `true`
- **决策依据：** QA 可自行完成媒体注入且 token 已成功；失败由候选产品响应头阻止产品自身 SDK 的真实服务连接，根因和限定修复位置均有代码与运行证据支持。
