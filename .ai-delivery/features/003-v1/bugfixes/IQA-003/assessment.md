# IQA-003 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-003
- **QA Run ID：** 本次 Independent QA（关联 `NR-DLV-20261113-BCCA3652FB86-0039`，未提供独立 Run ID）
- **Candidate SHA：** `8f23a795b014acf174497f1c11b5641f1de2739c`
- **环境：** `http://20.7.107.68`

## 问题报告

中文输入未产生流式原文变化；翻译接口虽未被调用，但这是因为 Speech 识别完全未开始，不能证明中文路由正确。

## 预期与实际行为

预期中文发言过程中直接显示并更新识别原文，且翻译请求始终为 0。实际原文变化为 0、Speech WebSocket 与帧为 0、翻译请求为 0。

## 复现步骤与证据

在候选环境授权媒体并播放中文合成音频。会话启动及 token `200` 成功，控制台随后指向 `wss://eastus2.stt.speech.microsoft.com/...` 的连接错误，浏览器没有 Speech WebSocket，因此没有任何中文 interim。

## 影响追踪

影响 `US-001`、`US-003`、`FR-001`—`FR-003`、`FR-007`、`SC-003`、`AC-001`、`AC-005`、场景 `IQA-003`，以及任务 `T004`、`T011`、`T012`、`T020`—`T022`。

## 根因分析

生产 CSP 的 `connect-src` 由配置的 Speech endpoint origin 生成，但 Azure Speech SDK 使用不同的区域 STT WSS origin；浏览器在 SDK 发送音频前阻断连接。现有安全 contract 测试遗漏此运行时重定向/连接形态。`speech-adapter` 和 `session-controller` 未收到识别事件，所以中文直显路径未执行；0 个翻译请求是前置链路未运行的结果，不能作为中文绕过翻译的通过证据，也没有证据支持另一个中文路由根因。

## 限定范围的修复方案

仅校正 CSP 对 Azure Speech 区域 WSS 的受限允许规则并增加相应 contract 覆盖，不改变中文路由或添加测试专用入口。

## 回归风险

需避免允许任意 WebSocket 域；同时不能把规则绑定到单一区域。修复后应真实验证中文 interim 多次变化、显示原文一致且 `/api/translations` 仍为 0 次。

## 未解决证据

识别前阻塞使中文语言检测、interim 和直显行为均未被真实执行；CSP 修复后必须重跑以排除被掩盖的中文路径缺陷。

## 分类与修复就绪决策

- **classification：** `product_defect`
- **ready_for_fix：** `true`
- **决策依据：** QA 已提供合法媒体和权限，产品 CSP 与 SDK 实际服务 origin 不兼容是候选可控且可定位的实现缺陷。
