# Coding 后 Convergence 报告

## 评审范围

recheck 模式，复检上一轮 `GR-DLV-20261113-BCCA3652FB86-0007` 的 `CONV-001`—`CONV-004`，并检查提示所列本轮改动是否引入新的阻塞问题。Convergence 未执行命令，仅核对 `intent.md`、`spec.md`、`design.md`、`tasks-implementation.md`、修订后的生产实现与测试，以及 `reports/implementation.md` 的新增记录。

## 结论

**需要修复（Repair Required）**。`CONV-001`、`CONV-002`、`CONV-003` 已由实现和定向测试解决，不再报告；`CONV-004` 的生产协议边界绕过问题已解决，但其明确要求的 15 秒连续更新与三项时限辅助证据仍未补齐，因此保留 1 项 HIGH 阻塞问题。无 CRITICAL 问题、无上游歧义或待人工决定事项。

## 阻塞问题

- **CONV-004**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：上一轮要求在现有 `T015` 范围内补齐连续更新与时限断言。修订后的 `tests/e2e/support/fake-driver.ts:109-115` 仅生成从 0 到 1.4 秒的英文输入；`tests/e2e/english-captions.spec.ts:7-16` 只观察两次草稿并把同一个 `fixedAt - draftAt` 同时与 5 秒和 3 秒比较。它没有执行 `spec.md:50`、`spec.md:171-178`、`T015` 所要求的至少 15 秒无明显停顿输入，没有记录期间每次可见更新及逐个相邻间隔，也没有以 final 事件时点计算 3 秒固定边界。实施报告所记 7/7 通过与测试代码相符，但这些断言无法证明获批的连续更新和时限辅助逻辑。
  - 修复建议：由 Coding 在现有 `T015` 范围内扩展协议级 Playwright 场景，使用至少 15 秒持续变化的英文输入，分别记录语音开始、每次可见草稿变化、final 识别和 fixed 时点，独立断言首条草稿小于 6 秒、所有相邻可见更新间隔不超过 5 秒、final 后固定小于 3 秒，并重新提供最小验证集真实结果。
  - resolvesPrevious：`CONV-004`

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| `FR-006`、`FR-009`、`AC-003`、`AC-006` / `T014`、`T019`、`T023` | `src/client/session-controller.ts` | `tests/unit/session-lifecycle.test.ts`、`tests/e2e/english-captions.spec.ts` | `CONV-001` 已解决：recognition 串行化，上一 final 完成后下一片段使用新 ID 追加 |
| design 恢复边界 / `T014`、`T017`—`T019` | `src/client/session-controller.ts`、`src/client/App.tsx` | `tests/unit/session-lifecycle.test.ts`、`tests/e2e/english-captions.spec.ts` | `CONV-002` 已解决：超限、NDJSON error 与 fetch 失败均终止旧会话，后续事件被忽略，恢复需要用户新建会话 |
| `FR-004`、`TD-004`—`TD-005` / `T014`、`T017` | `src/client/translation-scheduler.ts` | `tests/unit/translation-scheduler.test.ts` | `CONV-003` 已解决：碎片与重复值受抑制，完整 token 经 400 ms、持续变化经 2 秒提交 |
| `NFR-002`、`AC-008` / `T009`、`T015`、`T021`、`T024` | `src/client/App.tsx`、`src/client/session-controller.ts`、`src/client/translation-client.ts` | `tests/e2e/support/fake-driver.ts`、`tests/e2e/*.spec.ts` | 部分满足：测试已穿过生产会话、调度和 NDJSON 边界，但 15 秒连续更新及三项时限辅助证据仍缺失（`CONV-004`） |

## 开发者验证证据复核

实施报告新增记录 `npm ci --ignore-scripts`、`staticAnalysis`、`build`、22/22 developer、8/8 integration、7/7 Playwright、`npm audit` 及 runtime 定向检查通过。命令名称与 `package.json` 脚本相符；7 个 Playwright 用例数量与当前 `tests/e2e/` 对应，fake adapter 已通过 `SessionController` 和真实 NDJSON client，不再直接注入 reducer。

上述通过记录只证明现有断言成功。`CONV-004` 所述英文场景时长和时间计算与 `NFR-002`、`T015` 不符，因此“7/7 通过”不能替代缺失的连续更新与分段时限辅助证据。修复后应重跑报告声明的最小验证集；真实 Azure 黑盒结果仍由下游负责。

## 用户可见行为比较

- 跨片段英文 final 现在按顺序固定，新片段以新 ID 追加，符合 `INT-002`、`INT-006`。
- 失败后旧会话停止且只能由用户重新开始，符合批准的恢复边界。
- 英文碎片不立即翻译，完整 token 或持续变化快照可在 final 前形成草稿，符合 `INT-005` 的稳定短语行为。
- 本轮实现未显示将体验退化为 final-only；但本地测试仍未证明持续至少 15 秒时草稿持续更新及 6/5/3 秒辅助边界，故“边说边出”的必需 Coding 证据仍不完整。

## 架构、Contract、运维与任务覆盖

本轮 fake Speech adapter 经 `App` 注入后驱动生产 `SessionController`，翻译请求穿过生产 `streamTranslation` 与 NDJSON 解析，符合 `TD-009` 的协议级本地辅助边界。Speech SDK facade 测试覆盖 interim、final、NoMatch、取消、token 原位刷新和资源关闭；会话测试覆盖交错片段与三类失败恢复。未发现本轮新增的外部服务、telemetry、持久化、身份产品或运维依赖。

剩余问题属于已存在的 `T015` 实施与证据不完整，应直接返回 Coding；不创建新任务、不修改 `tasks-implementation.md`。根目录 `Dockerfile`、`runtime/deployment.json`、候选身份端点和功能脚本本轮未变，上一轮确认的下游就绪状态不因本轮改动受损。

## 延后平台证据

真实 Speech continuous recognition、真实 Foundry 流、AKS 候选身份与健康检查、不可变镜像 digest、`IQA-001`—`IQA-006`、部署环境 `NFR-002` 黑盒结果、Independent QA、UAT、审批、review 与 merge 均属后续平台阶段，本轮不因其尚未产生而阻塞。`CONV-004` 阻塞的是 Coding 已明确负责的本地协议级辅助证据，而非这些未来结果。

## 非阻塞观察与剩余风险

- `CONV-001`—`CONV-003` 的修复依赖当前定向测试覆盖，真实 Speech interim 节奏与 Foundry 延迟仍应由下游真实环境验证。
- 串行等待上一英文 final 可确保固定与追加顺序，其真实延迟影响应在 `IQA-002`、`IQA-005` 中观察，不在本门禁提前推断失败。
- 未发现本轮改动引入 secret、伪造下游证据或无批准追踪关系的新能力。
