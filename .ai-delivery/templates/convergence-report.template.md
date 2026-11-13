# Coding 后 Convergence 报告

## 评审范围

<!-- 被评审的提交、制品与代码范围；initial 或 recheck 模式。 -->

## 结论

<!-- `通过`（没有阻塞问题）或 `需要修复`。与结果文件一致：passed 当且仅当 findings 为空。 -->

## 阻塞问题

<!--
逐条列出与结果文件 findings 一一对应的阻塞问题；没有时写"无"。每条使用：
- **{FINDING-ID}**（severity：`critical` / `high`；owner：`coding` / `task-planning`；route：`current_stage` / `upstream_exception`）
  - 证据：已批准来源（FR / AC / IQA / T###）与实现或证据路径
  - 修复建议：
  - recheck 模式另写 resolvesPrevious 或 changedScope
现有任务实现错误或证据无效归 `coding`；已批准行为在任务计划中没有可执行任务归 `task-planning`。
-->

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-### / IQA-### / T### | `path/to/file` | `path/to/file` | {{结论}} |

## 开发者验证证据复核

<!-- 复核实施报告记录的命令、结果与测试代码是否相符；Convergence 不执行命令。 -->

## 用户可见行为比较

## 架构、Contract、运维与任务覆盖

## 延后平台证据

<!-- 候选验证、部署、Independent QA、UAT、合并等尚未产生的下游证据；不构成阻塞。 -->

## 非阻塞观察与剩余风险
