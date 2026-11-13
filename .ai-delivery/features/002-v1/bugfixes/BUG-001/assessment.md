# BUG-001 缺陷评估

## 缺陷信息

- **Bug ID：** BUG-001
- **QA Run ID：** NR-DLV-20261113-96F0EE0F92F9-0050
- **Candidate SHA：** `36ddbb8ba84d84f3958cf7af846c5ab9c24059e7`
- **环境：** `http://74.159.182.40`

## 问题报告

Independent QA 的 IQA-001、IQA-002、IQA-003 均在等待首个 `data-testid="subtitle"` 元素可见时于 120000 ms 后超时，完整浏览器流程未完成。三个场景具有相同的可观察失败和共同环境前置条件，因此作为一个问题评估。

## 预期与实际行为

- **预期：** 浏览器采集合成英语语音后，系统自动检测英语，经实际 Azure AI Speech 与 Azure AI Foundry 处理，并在发言期间逐步显示中文字幕。
- **实际：** 页面在超时时限内未显示任何字幕；QA 未能继续核验语言检测、字幕时序、语义顺序或实际依赖调用结果。

## 复现步骤与证据

1. 使用 Independent QA 提供的公网环境 `http://74.159.182.40` 执行 Playwright 黑盒流程。
2. 启动英语语音采集和翻译流程。
3. 等待第一个 `getByTestId('subtitle')` 可见。
4. IQA-001 至 IQA-003 均得到相同结果：`locator.waitFor: Timeout 120000ms exceeded`。

候选客户端在 `src/client/audio-capture.ts` 中通过 `navigator.mediaDevices.getUserMedia({ audio: true })` 采集音频；QA 环境地址明确使用公网 IP 的明文 HTTP。浏览器麦克风采集要求安全上下文，明文公网 HTTP 不满足该运行前置条件。QA 结果没有提供字幕、输入音频进度、依赖调用或其他成功证据。

## 影响追踪

- Requirement：FR-001、FR-002、FR-003、FR-004、FR-005、NFR-001。
- Acceptance：AC-001、AC-002、AC-003、AC-004。
- Scenario：IQA-001、IQA-002、IQA-003。
- Task：T010、T014、T019、T024、T029、T034。

## 根因分析

有证据支持的根因位于 QA 部署环境：测试目标是明文公网 HTTP 地址，而完整流程的第一步依赖浏览器麦克风 API。该 API 在此地址不具备所需安全上下文，因而无法建立规格要求的浏览器语音采集前置条件；没有音频进入后续 Speech、Foundry 和字幕链路，最终表现为等待首条字幕超时。

现有证据不支持将超时归因于产品字幕实现。候选已有字幕 DOM 渲染路径，本地 Playwright 也声明通过 fake microphone 输入已提交 WAV；但这些本地 deterministic 证据同样不能证明真实 Azure 流程正常。

## 限定范围的修复方案

不修改产品代码或测试。平台应以受信任的 HTTPS 地址重新部署同一 Candidate，并确保 Playwright 浏览器具备麦克风权限且按已批准场景输入已提交的合成英语音频，然后重新执行 IQA-001 至 IQA-003。重跑时应保留输入进度、浏览器错误、字幕变化及实际依赖调用的可关联证据。

## 回归风险

环境纠正不会改变产品行为，产品回归风险低。主要验证风险是仅修正 HTTPS 但仍未提供麦克风权限、合成音频输入或实际 Azure 依赖配置，导致再次出现同样的无字幕超时；因此重跑前必须逐项确认场景前置条件。

## 未解决证据

本次 QA 未提供 Playwright trace、浏览器控制台错误、麦克风权限状态、输入音频进度、WebSocket 事件、服务端日志或 Azure 依赖调用记录。因此尚不能排除安全上下文纠正后仍存在独立的产品或集成问题；这些问题只能在满足完整运行前置条件后凭新证据单独评估。

## 分类与修复就绪决策

- **classification：** `environment_failure`
- **ready_for_fix：** `false`
- **决策依据：** 当前失败由 QA 环境未满足浏览器语音采集的安全上下文前置条件导致，属于平台运行条件，不得通过产品代码或测试专用接口补偿。
