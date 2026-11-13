# Coding 后 Convergence 报告

## 评审范围

initial 模式。评审 `intent.md`、`spec.md`、`technical-baseline.md`、`design.md`、`tasks-implementation.md`、`reports/implementation.md`、`T001`—`T028` 对应实现与测试，以及 `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` 等候选就绪制品。Convergence 未执行命令，仅独立核对已有记录、测试代码与生产实现。

## 结论

**需要修复（Repair Required）**。发现 4 项 HIGH 阻塞问题，均为已有 Coding 任务的实现或证据缺陷，owner 为 `coding`，route 为 `current_stage`。无 CRITICAL 问题，无须回退上游，也无待人工决定事项。

## 阻塞问题

- **CONV-001**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：`FR-006`、`FR-009`、`AC-003`、`AC-006`、design“数据流、状态、并发与生命周期”及 `T014`、`T019`、`T023` 要求 final 优先、跨片段追加和异步代次安全。`src/client/session-controller.ts:98-100` 在英文 final 到达后等待翻译，但直到 completed 回调的 `src/client/session-controller.ts:126-128` 才重置片段；期间下一片段的 recognition 会在 `src/client/session-controller.ts:81-103` 复用同一 `segmentId` 并递增 revision。随后旧 final 的 delta/completed 会被 `src/client/caption-reducer.ts:65-79` 作为旧 revision 拒绝，导致上一片段不能固定，下一片段也不能按契约追加。现有测试没有模拟“上一英文 final 翻译仍在流式返回时下一片段已开始”的真实事件顺序。
  - 修复建议：由 Coding 在现有任务范围内先增加该交错事件顺序的失败测试，再修复片段生命周期，使上一片段 final 能可靠固定且下一片段使用新 ID 从尾部追加；提供 unit 与本地协议级 Playwright 通过证据。

- **CONV-002**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：design“SLO、限制、扩缩容、重试与恢复”及 `T014`、`T017`—`T019` 明确要求超限或依赖失败终止当前处理、清理资源、不自动重试或重放，只能由用户重新触发新会话。`src/client/session-controller.ts:106-109` 对 4000 code units 超限仅 `clearCurrent`，`src/client/session-controller.ts:129-136` 对翻译错误也仅 `clearCurrent`；两条路径均未停止 recognizer、取消会话资源或重置片段。后续 recognition 会在同一会话中自动再次调度翻译，直接违背已批准恢复边界。`tests/unit/recovery-behavior.test.ts` 只检查 reducer 清除 current 和保留 fixed，未覆盖生产会话是否终止及是否自动重试。
  - 修复建议：由 Coding 先补充超限、NDJSON error、fetch/依赖失败后的会话级测试，再使这些路径完整终止当前会话资源并阻止后续自动翻译，确认 fixed 保持不变且仅新用户操作可建立新会话。

- **CONV-003**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：`FR-004` 要求翻译“已经稳定的英文短语”，design `TD-004`、`TD-005` 及 `T014`、`T017` 将稳定判定定义为文本变化且至少新增完整 token，或持续变化达到 2 秒后取最新快照。`src/client/translation-scheduler.ts:25-45` 对任意非空文本调度，没有完整 token/变化判定或重复值抑制；且 `lastSubmittedAt` 初始为 0，在正常浏览器时钟下首个任意 partial 会立即提交。当前测试 `tests/unit/translation-scheduler.test.ts:5-20` 只验证 400 ms/2 秒调用，不验证稳定短语判定。候选因此可能把单词碎片或未变化的 interim 当作获批草稿反复翻译和展示。
  - 修复建议：由 Coding 按 `TD-005` 先补充碎片、完整 token、重复 interim 和持续变化边界测试，再实现稳定快照判定，同时保留 `NFR-002` 的持续更新预算。

- **CONV-004**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：Constitution“四、验证有效”、design 验证责任矩阵及 `T008`、`T009`、`T014`、`T015`、`T021`、`T024` 要求 Coding 提供覆盖生产状态机/协议适配器的确定性测试和协议级 fake adapter Playwright 辅助流程。`tests/e2e/support/fake-driver.ts:3-6` 仅设置全局场景值，`src/client/App.tsx:19-23,52-70` 随后直接向 reducer 注入事件，完全绕过 `SessionController`、Speech adapter、翻译调度、NDJSON client 和提交的 WAV。英文场景只有一次 draft 后 50 ms final，没有草稿修订、15 秒持续输入或相邻更新；`tests/e2e/english-captions.spec.ts:7-15` 因而只是测量硬编码 UI 定时器，却被 `reports/implementation.md:31,46,88,102` 记为草稿修订及 6/5/3 秒边界辅助证据。`tests/unit/speech-adapter.test.ts` 也只检查候选常量与刷新延迟，未覆盖 `T008` 声明的 recognition 分派、token 原位刷新和资源清理。开发者验证成功记录与实际测试能力不相符，不能证明必需 Coding 检查已完成。
  - 修复建议：由 Coding 将现有测试改为经生产协议边界驱动的 fake adapter 流程，补齐任务明确列出的 interim/final、草稿修订、连续更新、片段交错、停止/卸载/刷新和失败恢复断言；重新执行已声明的最小验证集，并在实施报告中只记录测试实际证明的结果。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| `FR-001`—`FR-002` / `AC-001` / `IQA-001` / `T007`—`T012` | `src/client/speech-adapter.ts`、`src/client/session-controller.ts`、`src/server/routes/config.ts`、`src/server/routes/speech-token.ts` | `tests/unit/speech-adapter.test.ts`、`tests/unit/session-lifecycle.test.ts`、`tests/e2e/streaming-session.spec.ts` | 部分；生产路径存在，但测试绕过生产会话且未覆盖任务声明的适配器行为（CONV-004） |
| `FR-004`—`FR-006` / `AC-002`—`AC-004`、`AC-008` / `IQA-001`、`IQA-002`、`IQA-005` / `T013`—`T019` | `src/client/translation-scheduler.ts`、`src/client/translation-client.ts`、`src/client/caption-reducer.ts`、`src/client/session-controller.ts`、`src/server/foundry-adapter.ts`、`src/server/routes/translations.ts` | `tests/unit/translation-scheduler.test.ts`、`tests/unit/caption-reducer-en.test.ts`、`tests/contract/translation-api.test.ts`、`tests/contract/foundry-adapter.test.ts`、`tests/e2e/english-captions.spec.ts` | 不满足；稳定短语、跨片段并发、失败恢复和功能证据存在阻塞缺口（CONV-001—CONV-004） |
| `FR-003`、`FR-007`、`FR-011` / `AC-005`、`AC-009` / `IQA-003`、`IQA-006` / `T020`—`T022` | `src/client/session-controller.ts`、`src/client/caption-reducer.ts` | `tests/unit/caption-reducer-zh.test.ts`、`tests/unit/language-routing.test.ts`、`tests/e2e/chinese-captions.spec.ts` | reducer 路径可追踪；本地 Playwright 仍为直接注入，并非批准的协议级流程（CONV-004） |
| `FR-008`—`FR-010` / `AC-006`—`AC-007` / `IQA-004` / `T023`—`T025` | `src/client/CaptionViewport.tsx`、`src/client/caption-reducer.ts`、`src/client/styles.css` | `tests/unit/caption-list.test.ts`、`tests/e2e/caption-viewport.spec.ts` | 静态追加与滚动有辅助覆盖，但真实英文片段交错会破坏追加（CONV-001），Playwright 绕过生产流程（CONV-004） |
| Contract、安全、身份与运维 / `T004`—`T006`、`T026`—`T028` | `src/shared/`、`src/server/`、`Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` | `tests/contract/`、`reports/implementation.md` | 就绪制品存在；health、candidate identity、非 root、无 PostgreSQL 和真实 Foundry 功能入口与设计一致 |

## 开发者验证证据复核

实施报告记录两轮 `npm ci --ignore-scripts`、`staticAnalysis`、`build`、16/16 developer、8/8 integration、4/4 Playwright、`npm audit`、runtime 语法检查及 Docker build/smoke 通过；第二轮首次 Playwright 因浏览器缺失失败，安装锁定 Chromium 后通过。命令名称、测试文件数量、runtime 声明和报告计数彼此可对应，报告也正确声明本地结果不替代真实 Azure 验收。

但是，通过记录只能证明现有断言通过。CONV-004 显示 Playwright 通过路径由生产代码中的测试分支直接注入 reducer，且多项 unit/contract 文件仅覆盖任务声明的一小部分，因此“完整 UI 辅助场景”“草稿修订”“获批时限判定逻辑”等成功声明没有相应可执行证据。CONV-001—CONV-003 还表明关键生产事件顺序未被现有测试触发。修复后必须重新提供 `staticAnalysis`、`build`、`developerTests`、`integrationTests`、`functionalTests` 的真实结果；无需在本阶段提前提供真实 Azure 或 Independent QA 结果。

## 用户可见行为比较

- 中文 interim 直显、中文 final 固定、固定字幕列表及视窗滚动在 reducer/UI 层与 `FR-003`、`FR-007`—`FR-011` 的基本形态一致。
- 英文当前草稿可接收流式 delta，final completed 可固定；但下一片段在上一 final 流完成前到达时会使 final 失效，偏离 `INT-002`、`INT-006`、`FR-006`、`FR-009` 的连续会议体验（CONV-001）。
- 依赖失败和超限后产品仍会在原会话自动处理后续 recognition，偏离已批准的“终止且仅由用户重新发起”恢复行为（CONV-002）。
- 任意英文 partial 可立即进入翻译，不符合 `INT-005`、`FR-004` 对“稳定英文短语”的要求（CONV-003）。
- “边说边出”没有被实现为 final-only，但现有本地功能测试不足以证明真实生产路径中的草稿修订、连续更新和时限辅助逻辑（CONV-004）；最终 6 秒/5 秒/3 秒黑盒结论仍应由下游真实环境产生。

## 架构、Contract、运维与任务覆盖

浏览器直连 Speech、同进程 Fastify BFF、Foundry NDJSON 流、无数据库/队列、Workload Identity、短期 Speech token、同源保护、正文/令牌脱敏和单容器边界均可追踪到 design。`Dockerfile` 使用 Node.js 22 多阶段构建及数字 UID `10001`；`runtime/deployment.json` 声明 8080、`/healthz`、`/candidate-identity`、无私网、无 PostgreSQL 和五类验证命令；候选身份端点逐字返回注入值。`developer-functional-run.sh` 对候选身份和真实 Foundry 流提供可执行检查，未伪装为 Speech 或完整 IQA。

`T001`—`T028` 虽均勾选，但 `T014`、`T017`—`T019` 的稳定判定、片段并发与恢复实现不完整，`T008`、`T009`、`T014`、`T015`、`T021`、`T024` 的测试证据未达到任务描述。上述均已有明确 Coding 任务负责，故不创建 append-only Convergence 任务，也不归给 Task Planning。

## 延后平台证据

以下证据按批准责任矩阵延后且不构成本门禁阻塞：clean runner Candidate checks、不可变 SHA 与 registry digest、AKS 部署 URL、真实 Workload Identity、公开 health/identity、真实 Speech continuous recognition、真实 Foundry 部署兼容性、`IQA-001`—`IQA-006`、`NFR-002` 黑盒 6 秒/5 秒/3 秒记录、Independent QA、UAT、发布审批、GitHub review 与 merge。Coding 已提供这些阶段所需的 Dockerfile、runtime 声明、候选身份端点和功能脚本；本报告阻塞的是其生产行为与 Coding 负责证据的具体缺陷，而非未来结果尚未产生。

## 非阻塞观察与剩余风险

- LOW：`src/server/foundry-adapter.ts` 只消费 `response.output_text.delta`，未显式判别 Responses 流中的失败/不完整终态；真实模型兼容性将由候选功能检查暴露。若修复上述 Coding 阻塞时确认 SDK 不会以异常结束该情形，可补充 contract 证据，否则应在既有 `T013`/`T016` 范围内处理。
- 未发现无需求追踪关系的数据库、外部 telemetry/logging backend、身份产品、告警或保留策略。
- 未发现 secret、伪造下游证据或把 health/build/mock 当作最终 IQA 通过的声明。
