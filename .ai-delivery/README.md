# AI Delivery 交付制品

本目录由 AIDelivery Hub 管理。每个阶段在独立的 GitHub Copilot cloud session 中运行，
不同 Session 不共享聊天历史；已提交的仓库内容是唯一的交接方式和审计记录。
阶段的启动、门禁、人工审批、候选验证、Independent QA 和合并均由 Hub 编排。

## 项目级文件（平台维护，Agent 只读）

- `constitution.md`：已批准的项目原则和不可协商规则。
- `context.json`：指向当前活动 Feature 目录（`activeFeatureDirectory`）。
- `templates/`：Markdown 制品的结构模板，见 `templates/README.md`。

## Feature 目录 `features/{NNN}-{repository}/`

当前活动 Feature 目录是唯一可写的交付制品目录；其他 Feature 目录不可修改。

- `request.json`：原始请求，不可修改。
- `intent.md`：业务问题、期望结果、受影响用户与系统、范围、约束和开放业务问题。
- `spec.md`：User Story、功能需求、按权威来源触发的质量要求、验收场景（`IQA-###`）和测试策略。
- `technical-baseline-proposal.json`：技术基线候选方案（Agent 产出）。
- `technical-baseline.md`：已批准的技术基线（Hub 生成）。
- `design.md`：架构、interface、数据、安全、运维和实施方案，以及 Coding 可写路径清单。
- `tasks-implementation.md`：按依赖排序的实现任务；Convergence 修复任务以 `## Convergence Phase N` 追加。
- `tasks-qa.md`：Independent QA 计划。QA 分支从每个候选 SHA 新切出，QA 计划和证据只保存在
  QA 分支，上线前由 Hub 一次性集成到交付分支。
- `reports/implementation.md`：只追加的 Coding 证据账本，每个 Session 一段。
- `reports/convergence.md`：Coding 后的 Convergence 评审报告。
- `runtime/deployment.json`：Candidate 部署与验证契约。
- `runtime/developer-functional-run.sh`：部署后由平台执行的开发者 functional 验证。
- `runtime/qa-run.sh`、`runtime/qa-result.json`：Independent QA 脚本与结果，同样只保存在 QA 分支。
- `bugfixes/{BUG-ID}/`：正式 QA 缺陷的 `assessment.md`、`fix.md`、`test.md`。
- `.state/results/{nodeRunId}.json`：每个 Agent Session（含门禁）提交的结构化结果文件。

门禁不产出 Markdown 报告，评审结论只记录在结果文件中。

## 规则

- 结构模板是只读参考，不复制到 Feature 目录，也不替代已批准制品。
- `.github/**`、`.ai-delivery/templates/**`、`constitution.md`、`context.json` 由平台维护，
  Agent 不得修改。
- 业务和产品决定只能由人作出；Agent 提出的问题经 Hub 交给对应负责人回答。
