# Task Planning 阶段门禁报告

## 门禁信息

- **阶段：** `task-planning`
- **检查轮次：** 1
- **当前制品：** `tasks-implementation.md`
- **直接前置制品：** `design.md`
- **结论：** `需要修复`

## 内部自检

已检查全部 33 项任务的依赖顺序、准确路径、测试先行顺序、可执行性和完成证据。任务整体按 Setup、Foundational、US2、US3、US1、Candidate readiness 排序，测试任务先于对应生产实现，用户故事与候选制品路径均有覆盖，且未把未来 CI、部署、Independent QA、UAT、发布、Review 或 Merge 结果作为 Coding 完成条件。

但当前任务清单仍遗漏三项已由 Technical Solution 明确固定的实现或验证义务：翻译请求体安全上限、语言目录响应的禁止缓存契约，以及生产应用文件系统只读约束。因此尚未完整覆盖 Coding 所需工作，不能进入实施。

## 直接前置一致性检查

已逐节核对 `design.md` 的组件根路径、接口契约、安全边界、部署约束、验证责任矩阵和 Quickstart，并以 `spec.md` 的 `IQA-001`～`IQA-008` 仅辅助检查验收场景追踪。Tasks 对主要架构、状态机、Speech/Foundry adapter、SSE、真实 Azure 场景、Dockerfile 和 `runtime/deployment.json` 的派生一致。

以下遗漏均与清晰、可执行且无歧义的 Design 决策不一致，责任属于当前 `task-planning` 阶段，不构成 Technical Solution 上游例外。

## 阻塞项

### TASK-SELF-001 翻译请求体安全上限未被任务覆盖

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 260 行要求按已验证的 Foundry 单次请求能力配置请求体安全上限，并对超限请求明确中断且不得截断、拆分或伪装成功。`T023` 仅概述翻译请求与错误契约测试，`T028` 仅概述 schema、Foundry adapter 和 SSE route 实现；二者均未要求实现或验证请求体上限及超限行为。
- **修复建议：** 在翻译 contract test 和对应 route 实现任务中明确加入请求体上限配置、超限拒绝、中断映射，以及不截断、不拆分、不调用上游的完成证据。

### TASK-SELF-002 语言目录响应的禁止缓存契约未被验证

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 154～167 行规定 `GET /api/source-languages` 成功响应必须设置 `Cache-Control: no-store`。`T008` 的边界和证据仅明确 Speech 短期 token 响应的 `Cache-Control: no-store`，`T013` 也未明确语言目录 route 的该响应头，导致权威语言目录不得被缓存的接口契约没有可判定的实现与测试证据。
- **修复建议：** 在语言目录 API contract test 与 route 实现任务中明确覆盖成功响应的 `Cache-Control: no-store`，并把断言通过列入完成证据。

### TASK-SELF-003 生产应用文件系统只读约束未被任务覆盖

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 294 行要求生产容器以非 root 用户和只读应用文件系统运行。`T031` 仅要求非 root 用户、production 产物和配置化端口，`T032` 未声明只读约束，`T033` 也只验证非 root 启动及 live/ready；没有任务负责落实或验证应用文件系统只读。
- **修复建议：** 在 `Dockerfile`、部署契约或二者对应任务中明确落实应用文件系统只读约束，并在候选容器验证任务中加入可复现的只读性检查及完成证据。

## 通过条件

修订 `tasks-implementation.md`，为上述三项 Design 义务补充准确路径、依赖、测试先行安排和可核验完成证据；再次执行 task-planning 门禁并确认 findings 为空。
