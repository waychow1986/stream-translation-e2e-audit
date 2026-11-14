# IQA-002 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-002
- **QA Run ID：** 本次 Independent QA（关联 `NR-DLV-20261113-BCCA3652FB86-0039`，未提供独立 Run ID）
- **Candidate SHA：** `8f23a795b014acf174497f1c11b5641f1de2739c`
- **环境：** `http://20.7.107.68`

## 问题报告

双片段英文输入没有产生 final 翻译或固定字幕，无法验证首段是否由完整译文替换、固定并抵抗第二段改写。

## 预期与实际行为

预期首段 final 后由完整中文译文替换草稿并固定，第二段不改变首段。实际 Speech WebSocket 为 0 个、翻译请求和固定片段均为 0。

## 复现步骤与证据

在候选环境授权媒体并播放双片段英文合成音频。会话启动与 token `200` 成功，但控制台报告连接 `wss://eastus2.stt.speech.microsoft.com/...`，没有建立 Speech WebSocket 或发送帧，因而没有 final、翻译请求或固定片段。

## 影响追踪

影响 `US-002`、`FR-006`、`FR-008`、`SC-002`、`AC-003`、`AC-004`、场景 `IQA-002`，以及任务 `T004`、`T011`、`T012`、`T015`、`T018`、`T019`。

## 根因分析

`src/server/security.ts` 的 CSP 只允许配置的 Speech 自定义端点 origin；SDK 实际连接区域 STT WSS origin，浏览器因此在识别前阻止 WebSocket。安全 contract 测试没有断言该运行时连接目标。token 路径已成功，`session-controller` 的 final 翻译与 reducer 固定逻辑未收到任何识别事件；0 个 final 请求和固定片段是同一上游产品缺陷的后果，当前无证据证明这些下游组件另有缺陷。

## 限定范围的修复方案

限定修改 CSP Speech 连接白名单及对应 contract 测试，使真实 SDK 区域 WSS 目标可连接，不改变翻译、reducer 或测试输入接口。

## 回归风险

错误的通配范围会扩大出站权限，区域硬编码则损害可部署性。修复后需真实重跑双片段英文，核验 final 请求、同一片段原位替换、固定标识和后续不可变。

## 未解决证据

当前阻塞发生在识别前，尚未获得 Foundry final 流和 reducer 固定行为的真实证据；修复后需重新评估可能被掩盖的下游故障。

## 分类与修复就绪决策

- **classification：** `product_defect`
- **ready_for_fix：** `true`
- **决策依据：** 候选产品 CSP 阻止其 SDK 必需连接，代码和运行证据一致，QA 脚本无法通过输入配置合法绕过产品 CSP。
