# BUG-001 缺陷评估

## 缺陷信息

- **Bug ID：** BUG-001
- **QA Run ID：** Independent QA 结果未提供独立 Run ID
- **Candidate SHA：** `36ddbb8ba84d84f3958cf7af846c5ab9c24059e7`
- **环境：** `http://74.159.182.40`

## 问题报告

Independent QA 的 IQA-001、IQA-002、IQA-003 均在等待首个 `data-testid="subtitle"` 元素可见时于 120000 ms 后超时，完整浏览器流程未完成。QA 将该现象列为 test gap；三个场景具有相同的可观察失败和相同的浏览器启动前置条件，因此作为 BUG-001 统一调查，但最终分类以调查证据为准。

## 预期与实际行为

- **预期：** 浏览器采集合成英语语音后，系统自动检测英语，经实际 Azure AI Speech 与 Azure AI Foundry 处理，并在发言期间逐步显示中文字幕。
- **实际：** 页面在超时时限内未显示任何字幕；QA 未能继续核验语言检测、字幕时序、语义顺序或实际依赖调用结果。

## 复现步骤与证据

1. Independent QA 使用公网环境 `http://74.159.182.40` 执行 Playwright 黑盒流程。
2. 流程尝试启动英语语音采集和翻译。
3. 流程等待第一个 `getByTestId('subtitle')` 可见。
4. IQA-001 至 IQA-003 均得到相同结果：`locator.waitFor: Timeout 120000ms exceeded`。

候选客户端在 `src/client/audio-capture.ts` 中通过 `navigator.mediaDevices.getUserMedia({ audio: true })` 采集音频；`playwright.config.ts` 的开发者流程也明确使用 fake media 参数、麦克风权限和已提交的合成 WAV。人工审批意见 HT-DLV-20261113-96F0EE0F92F9-0010 已确认：平台本轮仅提供 HTTP 公网地址，Independent QA 必须在 Chromium 启动时加入 `--unsafely-treat-insecure-origin-as-secure=<QA_BASE_URL>`，并同时使用 fake media 参数注入合成语音。该意见明确把安全上下文认定为测试工具启动条件，而非产品缺陷。

本次 QA 结果仅记录等待字幕超时，`evidence` 为空，未提供浏览器控制台、WebSocket 收发消息、音频注入进度或实际 Azure 依赖调用证据，因而不能证明上述启动条件已满足，也不能把无字幕定位到产品链路。

## 影响追踪

- Requirement：FR-001、FR-002、FR-003、FR-004、FR-005、NFR-001。
- Acceptance：AC-001、AC-002、AC-003、AC-004。
- Scenario：IQA-001、IQA-002、IQA-003。
- Task：T010、T014、T019、T024、T029、T034。

## 根因分析

有证据支持的阻塞根因是 Independent QA 运行条件不完整：HTTP 公网地址上的 Chromium 需要显式把 `QA_BASE_URL` 视为安全来源，并需要 fake media 参数注入合成语音。人工审批已把这些条件认定为测试工具启动条件；QA 结果未提供任何证据证明这些条件已配置。缺少浏览器启动参数或场景前置配置按本阶段规则属于 `environment_failure`。

直接可观察的超时发生在字幕等待处，但候选只有收到 `subtitle.delta` 或 `subtitle.final` 后才渲染 `data-testid="subtitle"`。在没有控制台、WebSocket 和依赖调用证据的情况下，无法证明合成音频已进入候选，也无法把失败进一步定位到 Speech、Foundry 或字幕渲染。现有证据不支持产品缺陷结论；本地 deterministic 测试同样不能替代真实 Azure 完整流程证据。

## 限定范围的修复方案

不修改产品代码或测试，该问题不可进入 Coding Repair。Independent QA 应在同一 Candidate 和现有 `http://74.159.182.40` 环境上，按人工审批意见为 Chromium 增加 `--unsafely-treat-insecure-origin-as-secure=<QA_BASE_URL>`，同时配置 fake media 参数、麦克风权限并注入合成英语 WAV，然后重新执行 IQA-001 至 IQA-003。场景失败时必须采集浏览器控制台和 WebSocket 收发消息，并关联输入进度、字幕变化及实际依赖调用证据。

## 回归风险

纠正 QA 启动条件不会改变产品行为，产品回归风险低。主要验证风险是仅增加安全来源参数，却未同时授予麦克风权限、启用 fake media 或注入合成 WAV，导致再次出现相同超时；另一个风险是未采集控制台和 WebSocket 证据，使后续真实产品或集成故障仍无法定位。

## 未解决证据

本次 QA 未提供 Playwright trace、浏览器控制台错误、Chromium 启动参数、麦克风权限状态、输入音频进度、WebSocket 收发消息、服务端日志或 Azure 依赖调用记录。人工已经给出可在现有 HTTP 地址重跑的启动条件，不再缺少产品决定；但仍需 operator 提供按该条件配置完成的 QA 云执行环境并产出重跑证据。在取得该证据前，IQA-001 至 IQA-003 无有效验收结论，也不能排除修正运行条件后暴露独立的产品或集成问题。

## 分类与修复就绪决策

- **classification：** `environment_failure`
- **ready_for_fix：** `false`
- **决策依据：** 当前证据仅支持 QA 浏览器启动参数和合成语音注入前置条件未得到证明，人工审批也明确认定其为测试工具运行条件。按规则该现象属于环境故障，须由 Independent QA 按指定参数重跑，不得通过产品代码或测试专用接口补偿。
