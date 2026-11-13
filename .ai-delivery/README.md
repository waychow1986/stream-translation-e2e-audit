# GitHub-native 交付制品

每个 SDLC 阶段均在新的 GitHub Copilot cloud session 和 sandbox 中运行。不同阶段
不共享聊天历史；Git 是唯一的制品交接方式和审计记录。

项目级文件：

- `constitution.md`：已批准的项目原则和不可协商规则。
- `context.json`：由平台维护、指向 active Feature 目录的指针。
- `templates/`：为新项目安装的只读 Markdown 结构契约。

每个 Feature 使用 `features/<NNN>-<feature>/` 目录：

- `intent.md`：业务问题、原因、期望结果、受影响用户与系统、范围、约束和开放问题。
- `spec.md`：已批准 Intent 范围内的 User Story、FR、按权威来源触发的 NFR、完整产品
  行为闭合、成功标准、验收标准、场景、按需产品澄清和测试策略。
- `technical-baseline.md`：当前 Feature 已批准的技术约束。
- `design.md`：架构、interface、数据、安全、运维和实施方案。
- `tasks-implementation.md`：按依赖排序的生产实现、开发者测试、部署与可测试性准备。
- `tasks-qa.md`：Candidate 部署后由 Independent QA Agent 独立生成并锁定的 QA 执行计划。
- `reports/implementation.md`：跨 Coding Session 追加且不可覆盖的累计实现证据，以及延后的下游检查。
- `reports/convergence.md`：实现后的 Convergence 证据。
- `runtime/deployment.json`：Candidate 部署和验证契约。
- `runtime/developer-functional-run.sh`：由开发阶段维护的 functional validation。
- `runtime/qa-run.sh`：Independent QA 计划，只保留在专用 QA branch。
- `.state/*.json`：平台和 Agent 的机器投影，绝不是产品意图来源。

当前唯一支持的流程为 WorkflowVersion 20。Specification 会在 Stage Gate 前集中澄清
最多五个高影响 `PQ-###` 产品问题；低影响细节继续使用明确记录的合理默认。Coding
实施报告采用追加式证据契约，平台执行 Base Commit 前缀校验，阻止后续 Coding 批次
覆盖历史证据。

创建或重写 Markdown 制品前，责任 Agent 必须读取对应的
`.ai-delivery/templates/*.template.md`，保留必需章节和顺序，用当前 Delivery 内容
替换模板说明，并删除未使用的占位内容。模板不会复制到 Feature 目录，也不能替代已批准
制品。

每次只运行一个阶段。选择对应 custom agent，以当前 Delivery branch 为目标，审阅其
pull request，并在启动下一阶段前合并已批准制品。GitHub Actions 在干净 Runner 中验证
Candidate。失败必须返回责任阶段；只有已批准输入发生变化时，才重新生成下游制品。

Custom agent profile 必须先存在于仓库 default branch，才会出现在 GitHub Agents
选择器中。应用工作始终隔离在 Delivery branch。
