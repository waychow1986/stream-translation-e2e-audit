# Coding 后 Convergence 报告

## 评审范围

本次按 initial 模式评审当前候选。评审范围包括 Constitution、`intent.md`、`spec.md`、`technical-baseline.md`、`design.md`、`tasks-implementation.md`、全部 Coding 实施记录、当前生产实现与测试，以及 `Dockerfile`、`runtime/deployment.json`、候选身份端点和功能验证脚本。Convergence 未执行命令，只独立核对记录、结果和测试代码是否相符。

## 结论

**需要修复（Repair Required）**。发现 1 个 HIGH 阻塞问题：英文 interim 超过已批准的 4000 code units 限制时，当前实现不会终止会话，可能令长片段停止继续产生流式草稿并继续接受后续识别。该问题属于既有任务实现不完整，应返回 Coding 修复。无待人工决定事项。

## 阻塞问题

- **CONV-005**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：`design.md`“领域与数据模型”及“SLO、限制、扩缩容、重试与恢复”要求 Speech 单片段超过 4000 code units 时终止片段处理且不拆分；`T014`、`T017` 明确要求超限时终止且不自动重放。`src/client/session-controller.ts:145-149` 只在实际提交翻译时终止超限内容，而 `src/client/translation-scheduler.ts:27-30` 对超限 interim 仅静默 `dispose()` 后返回，不通知 controller 终止会话。`tests/unit/session-lifecycle.test.ts:130-149` 仅覆盖超限 final，未覆盖超限 interim。因此超过限制的持续英文 interim 会保留 current、保持 recognizer 活跃并继续接收事件，且调度器停止提交草稿，违背获批的终止边界和核心流式体验。
  - 修复建议：在既有 `T014`、`T017`—`T019` 范围内，使超限 interim 与超限 final 一致地终止会话、清除 current、释放 Speech/计时器/请求并忽略旧会话后续事件；增加 test-first 单元或协议级证据，覆盖 4001 code units interim、资源终止、fixed 保留、后续事件不处理及仅由用户新建会话恢复。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| `INT-001`、`INT-003`、`INT-009` / `US-001` / `FR-001`—`FR-002` / `AC-001` / `T007`—`T012` | `src/client/speech-adapter.ts`、`src/client/session-controller.ts`、`src/client/App.tsx` | `tests/unit/speech-adapter.test.ts`、`tests/unit/session-lifecycle.test.ts`、`tests/e2e/streaming-session.spec.ts` | continuous recognition、英中候选、手动启停及 interim 上屏路径已覆盖；超限 interim 的终止缺口见 `CONV-005` |
| `INT-002`、`INT-005`—`INT-006` / `US-002` / `FR-004`—`FR-006` / `NFR-002` / `AC-002`—`AC-004`、`AC-008` / `T013`—`T019` | `src/client/translation-scheduler.ts`、`src/client/translation-client.ts`、`src/client/caption-reducer.ts`、`src/server/foundry-adapter.ts`、`src/server/routes/translations.ts` | `tests/unit/translation-scheduler.test.ts`、`tests/unit/caption-reducer-en.test.ts`、`tests/e2e/english-captions.spec.ts` | 草稿修订、latest-wins、final 替换固定及确定性 6/5/3 秒辅助判定已覆盖；真实时限延后平台验证 |
| `INT-003`—`INT-004` / `US-003` / `FR-003`、`FR-007`、`FR-011` / `AC-005`、`AC-009` / `T020`—`T022` | `src/client/session-controller.ts`、`src/client/caption-reducer.ts` | `tests/unit/caption-reducer-zh.test.ts`、`tests/unit/language-routing.test.ts`、`tests/e2e/chinese-captions.spec.ts` | 中文 interim 原文直显、绕过翻译及 final 固定有对应实现与辅助功能证据 |
| `INT-006`—`INT-007` / `US-004` / `FR-008`—`FR-010` / `AC-006`—`AC-007` / `T023`—`T025` | `src/client/CaptionViewport.tsx`、`src/client/caption-reducer.ts`、`src/client/styles.css` | `tests/unit/caption-list.test.ts`、`tests/e2e/caption-viewport.spec.ts` | fixed append-only、固定视窗及自动跟随有对应实现与辅助功能证据 |
| `TD-001`—`TD-010`、Interface Contract、安全与生命周期 / `T004`—`T006`、`T010`、`T013`、`T016`、`T026`—`T028` | `src/server/`、`src/shared/`、`Dockerfile`、`.ai-delivery/features/003-v1/runtime/` | `tests/contract/`、`reports/implementation.md` | API、身份、同源、安全头、关闭、容器和 runtime 就绪制品基本对应；超限客户端生命周期实现不完整 |

## 开发者验证证据复核

`reports/implementation.md` 最新 Session 记录 `staticAnalysis`、`build`、22/22 developer tests、8/8 integration tests、8/8 Playwright functional tests、依赖审计及 runtime 定向检查通过；Playwright 1.65.1 的 Ubuntu 26.04 映射也有本地覆盖验证。命令分类、当前测试数量与仓库脚本及测试文件相符，且报告没有把本地 fake adapter 结果冒充真实 Azure 验收。

但“全部 Coding 产出通过”的结论未覆盖 `CONV-005`：现有超限生命周期测试只向 controller 发送 `final: true`，不会进入 scheduler 对超限 interim 静默返回的分支。因此现有通过记录不能证明该已批准边界已实现，阻塞项仍成立。

## 用户可见行为比较

正常长度场景中，当前实现能够在英文 final 前显示并修订中文草稿、以完整译文替换并固定；中文 interim 原文直显且不调用翻译；新片段在固定视窗底部追加并自动跟随。这些行为与 `INT-001`—`INT-007`、`FR-001`—`FR-011` 的主路径一致。

长英文片段的 interim 一旦超过 4000 code units，scheduler 会停止计时与提交但会话仍显示为运行并继续接收识别，可能使字幕停留在旧草稿或空 current，既没有按批准设计终止，也会削弱 `INT-009` 的“边说边出”体验，因此不能批准当前候选。

## 架构、Contract、运维与任务覆盖

实现总体保持浏览器直连 Speech、同进程 Fastify BFF、Foundry NDJSON 流、单容器、无数据库/队列/持久化的批准架构。`GET /healthz`、`GET /candidate-identity`、配置、Speech token 和翻译接口均存在；根目录 `Dockerfile` 使用数字 UID `10001` 和 8080 端口；`runtime/deployment.json` 声明五类验证命令、健康/身份路径、无私网和无 PostgreSQL；`runtime/developer-functional-run.sh` 可检查候选身份并执行真实 Foundry 流式请求。

未发现无批准追踪关系的外部产品、服务、telemetry backend、身份产品、数据库、告警或保留策略。`CONV-005` 已由现有 `T014`、`T017`—`T019` 覆盖，不属于 Feature 规划缺口，不应追加 Convergence 任务或修改 `tasks-implementation.md`。

## 延后平台证据

不可变候选上的 Candidate checks、镜像构建与 registry digest、AKS 部署 URL、真实 Workload Identity、真实 Speech/Foundry 行为、`IQA-001`—`IQA-006`、`NFR-002` 黑盒时限、Independent QA、UAT、发布审批、GitHub review 和 merge 均属于后续平台阶段。本报告不因这些结果尚未产生而阻塞，也不将本地 fake adapter、build、health check 或接口级 Foundry 检查视为其替代证据。

## 非阻塞观察与剩余风险

- 真实 Speech interim 节奏、continuous language identification、网络及 Foundry 首 token 延迟仍可能使部署环境的 6/5/3 秒边界失败，须由后续真实环境 Playwright 黑盒证据判定。
- 结构化日志当前主要覆盖进程启动与终止，未完整体现 design 列出的 token、Foundry、取消和 schema 拒绝事件；这不改变已批准用户行为，当前按非阻塞运维观察保留。
- 当前未发现范围扩张、固定字幕改写、中文调用翻译、secret 写入或伪造下游证据。
