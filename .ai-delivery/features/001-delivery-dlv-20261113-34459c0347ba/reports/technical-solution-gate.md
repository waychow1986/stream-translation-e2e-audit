# Technical Solution 阶段门禁报告

## 门禁信息

- **阶段：** `technical-solution`
- **检查轮次：** 2
- **当前制品：** `design.md`
- **直接前置制品：** `spec.md`、`technical-baseline.md`
- **结论：** `需要修复`

## 内部自检

已检查实施就绪状态、技术上下文、架构与替代方案、状态和数据模型、机器可读根路径、接口契约、安全边界、配置运维、部署回滚、验证责任及开放决策。`design.md` 已将 `implementationReady` 设为 `false`，明确禁止 Coding 猜测参数、缩减语言范围或把条件式候选当作可执行架构；上一轮关于语言能力未闭合却声明实施就绪的当前阶段根因已被真实能力核对取代，不再重复报告原 finding。其余已设计部分内部一致，并明确标识尚不可实施的候选契约。

`gpt-sol-6.1` 目标 deployment 的 API、streaming 与关闭 reasoning 能力仍缺少获批环境证据。`design.md` 没有伪造结果，并正确停止实施；该证据由已批准 technical baseline 明定为“基线批准前”先决条件，当前阶段无权提供目标订阅资源或重批基线。由于本次任务只允许将上游例外路由给 `specification`，本报告不把同一缺口再次包装为 `technical-solution` 当前阶段修复项，也不生成不符合路由契约的 finding。

## 直接前置一致性检查

已逐项检查 `FR-001`～`FR-007`、`NFR-001`、`AC-001`～`AC-007` 以及技术基线。方案忠实保留浏览器采集、持续转写、自动语言检测、中文流式字幕、手动启停、中断可见和手动恢复行为，也遵循单容器、无持久化、凭据隔离、真实 Playwright E2E 及不可变候选等基线约束。

对 `AC-002` 的技术核对已经闭合：批准的三个候选均依赖 Microsoft Azure AI Speech continuous language identification，而单个 continuous recognizer 最多接受 10 个候选语言；验收要求所指服务完整自动检测语言集合超过 10 个。预选、截断、分批或并行 recognizer 都会改变已批准产品契约。该结果不是 Technical Solution 可继续选择实现细节消除的缺口，而是 `spec.md` 的明确义务在全部批准候选中不可实现，满足严格的 Specification 上游例外条件。

## 阻塞项

### TS-PRED-001 完整自动检测语言集合要求在批准技术候选中不可实现

- **严重性：** `high`
- **范围：** `predecessor`
- **制品：** `spec.md`
- **责任 Agent：** `specification`
- **路由：** `upstream_exception`
- **原因类型：** `infeasible`
- **证据：** `spec.md` 的 `FR-002`、`SC-002`、`IQA-002` 和 `AC-002` 要求同一流程无需预选语言地覆盖验收时服务可自动检测的完整语言集合。`technical-baseline.md` 第 22 行规定：若 continuous language identification 的有限候选列表或上限低于完整集合，则任何批准候选都不能满足 `AC-002`。`design.md` 第 7～12、18～19、29～31、59～69、267～280 和 292～295 行记录本轮能力核对结果：Microsoft Azure AI Speech continuous LID 单 recognizer 最多 10 个候选语言，而权威支持集合超过 10 个；候选 A、B、C 仅改变 SDK 或托管位置，均不消除同一服务上限。
- **修复建议：** 由 Specification 在保留已批准业务目标的前提下，依据已确认的服务能力重新决定并批准可实现的源语言检测产品行为及相应 `FR`、`SC`、`AC`、`IQA`；不得由 Technical Solution 或 Coding 擅自采用预选语言、截断集合、抽样验收、分批或并行 recognizer 作为替代。Specification 修复获批后，重新生成完整可执行的 Technical Solution。

## 通过条件

Specification 必须消除 `AC-002` 与已批准技术候选真实能力之间的不可实现义务并获得批准；随后 Technical Solution 应依据修复后的直接前置制品重新固定可执行架构、完整 provider contract 和验证责任，确认所有基线先决条件后方可声明实施就绪。
