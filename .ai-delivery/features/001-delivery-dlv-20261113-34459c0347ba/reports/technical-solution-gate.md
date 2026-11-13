# Technical Solution 阶段门禁报告

## 门禁信息

- **阶段：** `technical-solution`
- **检查轮次：** 1
- **当前制品：** `design.md`
- **直接前置制品：** `spec.md`、`technical-baseline.md`
- **结论：** `需要修复`

## 内部自检

已检查架构、组件边界、机器可读根路径、数据与状态模型、接口契约、安全边界、配置与运维、部署回滚、验证责任和实施就绪状态。方案的结构、职责边界、契约覆盖和验证分层总体完整，但两个被批准技术基线明确列为先决条件的关键服务能力尚未得到确认，因而 `implementationReady: true` 缺少可行性依据。

## 直接前置一致性检查

方案总体忠实覆盖 `spec.md` 的 `FR-001`～`FR-007`、`NFR-001`、`AC-001`～`AC-007`，并遵循批准技术基线选定的浏览器直连 Speech、BFF 代理 Foundry 翻译、SSE、单容器及 Azure Container Apps 边界。当前未发现需要推翻或澄清 Specification 的严格上游例外；阻塞项均属于 Technical Solution 尚未完成批准基线要求的技术可行性闭合。

## 阻塞项

### TS-SELF-001 单会话完整自动检测语言集合的可行性尚未闭合

- **严重性：** `high`
- **范围：** `self`
- **制品：** `design.md`
- **责任 Agent：** `technical-solution`
- **路由：** `current_stage`
- **原因类型：** `incomplete`
- **证据：** `spec.md` 的 `AC-002` 要求在同一运行流程中无需预选语言地逐一覆盖验收时服务可自动检测的完整语言集合；`technical-baseline.md` 明确要求先验证目标 SDK、订阅和区域能否在单次会话覆盖该集合，并指出候选数量或 API 上限会使所有候选架构均无法满足该标准。`design.md` 第 7、16、25、238、260 行仍将该能力作为部署或下游 integration 才确认的条件，同时第 5 行声明 `implementationReady: true`，未给出所选浏览器 Speech SDK 配置能够承载完整集合的已确认可行性结论。
- **修复建议：** 在 Technical Solution 中完成目标 SDK、订阅和区域下单次 continuous language identification 候选能力与完整权威语言集合的可行性闭合，并据结果确定可实施方案；若验证表明所有批准候选架构均无法满足 `AC-002`，应以该具体不可实现证据触发 Specification 上游例外，而不是继续声明实施就绪或把决定推迟到发布门禁。

### TS-SELF-002 指定模型的流式且关闭 reasoning 能力尚未闭合

- **严重性：** `high`
- **范围：** `self`
- **制品：** `design.md`
- **责任 Agent：** `technical-solution`
- **路由：** `current_stage`
- **原因类型：** `incomplete`
- **证据：** `technical-baseline.md` 明确规定，目标订阅、区域或 `gpt-sol-6.1` deployment 是否同时支持流式输出与关闭 reasoning 必须在基线批准前确认，且不得静默换模或伪造配置。`design.md` 第 7、16、57、178、226、260 行选择了 `/openai/v1/responses`、`stream: true` 和 `reasoning.effort: "none"`，但仍把该组合的真实支持情况留作部署或远程 integration 前置条件；在没有确认所选 deployment 与参数契约可用时，第 5 行的实施就绪结论缺少依据。
- **修复建议：** 在 Technical Solution 中闭合目标 `gpt-sol-6.1` deployment 对所选 API、流式输出及关闭 reasoning 参数的兼容性，并据确认结果固定可执行契约；若批准 deployment 无法满足基线约束，应停止实施就绪声明并按治理路径处理基线冲突，不得由 Coding 自行换模或降级。

## 通过条件

Technical Solution 必须分别闭合上述两项目标环境能力与所选实现契约的可行性，消除与 `implementationReady: true` 的矛盾，并保持对 `spec.md`、`technical-baseline.md` 及 Constitution 的其余覆盖不变。
