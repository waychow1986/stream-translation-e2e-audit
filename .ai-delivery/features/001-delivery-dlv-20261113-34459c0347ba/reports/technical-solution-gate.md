# Technical Solution 阶段门禁报告

## 门禁信息

- **阶段：** `technical-solution`
- **检查轮次：** 3
- **当前制品：** `design.md`
- **直接前置制品：** `spec.md`、`technical-baseline.md`
- **结论：** `需要修复`

## 内部自检

已完整检查实施就绪声明、技术上下文、架构与替代方案、领域和状态模型、机器可读根路径、数据流与生命周期、接口契约、安全隐私、配置运维、扩缩容与恢复、部署回滚、验证责任、Quickstart、Runbook 及开放决策。方案已闭合一至十种候选源语言、浏览器直连 Speech、Foundry 流式翻译、凭据隔离、无持久化、不可变部署及真实 Playwright 验证等主要实现选择，路径清单也明确覆盖应用、测试、仓库控制文件和 `runtime/deployment.json`。

但状态模型遗漏了已处于 `interrupted` 时的手动停止转换及其资源和界面处理。该状态转换是 Coding 实现流程控制所需的明确契约，当前 `implementationReady: true` 因而尚不成立。

## 直接前置一致性检查

已逐项核对 `FR-001`～`FR-008`、`NFR-001`、`AC-001`～`AC-008`、`IQA-001`～`IQA-008` 及 technical baseline。上一轮关于完整语言集合不可实现的上游问题已由获批 `PQ-001` 及更新后的 Specification 消除；当前方案忠实采用每次一至十种候选语言并在范围内自动检测，不重复上一轮 finding。

除中断状态下的手动停止行为外，方案保留了浏览器采集、持续转写、中文流式字幕、有效与无效候选边界、手动发起和停止、中断可见、手动重新发起及不补发内容等已批准行为，并符合已批准技术栈、数据边界、部署方式和验证职责。

## 阻塞项

### TS-SELF-001 状态模型未定义中断状态下的手动停止

- **严重性：** `high`
- **范围：** `self`
- **制品：** `design.md`
- **责任 Agent：** `technical-solution`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `spec.md` 的“US-003 控制实时字幕流程边界”和“业务状态”明确规定参会者可在中断时手动停止，状态由中断转换为已停止；`design.md` 的状态转换表仅定义 `running` 状态下的手动停止，并把 `interrupted` 只列为可手动重新发起的起始状态。其停止、中断与并发说明也只描述运行中手动停止和失败进入中断，没有定义 `interrupted → stopped` 的用户动作、状态转换及资源幂等清理。
- **修复建议：** 在 Technical Solution 的状态模型、生命周期处理和相应验证责任中明确 `interrupted` 状态下手动停止到 `stopped` 的转换，固定其用户可见结果及幂等资源清理契约，并保持 Specification 已批准行为不变。

## 通过条件

Technical Solution 必须补全 `interrupted → stopped` 的手动停止技术契约及对应验证覆盖，使状态模型完整派生自 Specification；完成后重新确认实施就绪状态。
