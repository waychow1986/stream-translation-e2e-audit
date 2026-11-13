# AI Delivery Markdown 模板

本目录中的模板是 Markdown 制品结构的唯一来源。Hub 在每个 Session 的起点读取模板并校验制品：

- 恰好一个 H1（代码块内的行不计入）；
- 按模板顺序包含模板中的全部 H2 和 H3 标题，标题文字保持不变；可以追加其他标题，但不得改变顺序；
- 不保留模板中的 HTML 注释说明，并替换全部 `{{...}}` 占位内容。

模板是只读参考，Agent 不得修改，也不得把模板复制为交付制品。机器可读文件（结果文件、
`runtime/deployment.json`、`technical-baseline-proposal.json`、QA 结果）按各自契约编写，不从模板推断。

## 模板与制品

`{F}` 表示当前活动 Feature 目录。

| 模板 | 制品 |
|---|---|
| `constitution.template.md` | `.ai-delivery/constitution.md`（项目创建时由平台生成） |
| `intent.template.md` | `{F}/intent.md` |
| `spec.template.md` | `{F}/spec.md` |
| `design.template.md` | `{F}/design.md` |
| `tasks-implementation.template.md` | `{F}/tasks-implementation.md` |
| `implementation-report.template.md` | `{F}/reports/implementation.md`（每个 Session 追加一个 `## Coding Session {nodeRunId}` 段，段内 H3 与模板一致） |
| `convergence-report.template.md` | `{F}/reports/convergence.md` |
| `bug-assessment.template.md` | `{F}/bugfixes/{BUG-ID}/assessment.md` |
| `bug-fix.template.md` | `{F}/bugfixes/{BUG-ID}/fix.md` |
| `bug-test.template.md` | `{F}/bugfixes/{BUG-ID}/test.md` |

门禁不产出 Markdown 报告；技术基线由 Hub 生成，均没有模板。

Specification 模板中的质量章节是条件性位置：只有已批准 Intent、直接规定用户可见行为的准确
Constitution 条款或人工给出的产品答案才能授权质量要求；未触发时明确记录"当前没有获批准的额外要求"。
