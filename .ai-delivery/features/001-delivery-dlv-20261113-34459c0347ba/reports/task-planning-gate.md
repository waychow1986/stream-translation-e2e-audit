# Task Planning 阶段门禁报告

## 门禁信息

- **阶段：** `task-planning`
- **检查轮次：** 3
- **当前制品：** `tasks-implementation.md`
- **直接前置制品：** `design.md`
- **结论：** `需要修复`

## 内部自检

已检查全部 33 项任务的完整性、依赖顺序、可执行性、准确路径、测试先行顺序和完成证据。上一轮 `TASK-SELF-004` 已实质修复：`T010` 现在明确列出十个非敏感语音文件路径、manifest 关联、逐文件 Chromium 麦克风注入方式及文件可解析证据，不再重复该 finding。

当前任务整体按测试先于生产实现排列，也未把未来 CI、部署、Independent QA、UAT、发布、Review 或 Merge 结果错误设为 Coding 完成条件。但绿地 SPA 缺少入口文件任务，且 `T014` 的完成证据依赖尚未实现的后续能力，当前依赖链无法按声明顺序逐项完成。

## 直接前置一致性检查

已逐节核对 `design.md` 的技术上下文、架构与决策、数据模型和状态机、机器可读根路径、组件职责、接口与错误契约、安全边界、配置运维、部署约束、验证责任矩阵及 Quickstart，并仅用 `spec.md` 的 `IQA-001`～`IQA-008` 检查继承验收场景追踪。Tasks 已覆盖 Speech/Foundry adapter、SSE、生命周期、真实 Azure 测试、容器和部署契约，上一轮要求的真实语音资产也已覆盖。

Design 明确要求 React + Vite SPA、构建后的 SPA 静态资源及可构建的单一容器。Tasks 只创建 Web package/config、组件和 `App.tsx`，没有负责 Vite HTML 与浏览器启动入口的准确路径，因而不能从当前任务集产出可启动 SPA。此处 Design 清晰可行，遗漏归属当前阶段。另一个阻塞项是 Tasks 自身依赖与完成证据冲突，不构成上游异常。

## 阻塞项

### TASK-SELF-005 React SPA 缺少可启动入口文件任务

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 14～15、32～33、117～124、294 行要求以 React + Vite 构建 SPA、由 Fastify 提供构建后的静态资源并将 production 产物复制到容器。`T001` 仅创建 `apps/web/package.json`，`T003` 仅创建 Vite/TypeScript/Vitest 配置，`T022` 与 `T029` 只列出组件及 `apps/web/src/App.tsx`；全部任务均未指定 `apps/web/index.html` 或浏览器启动入口（如 `apps/web/src/main.tsx`）的创建责任。绿地仓库因此无法由所列路径形成 Vite 可启动、可构建的 SPA，`T031` 的 SPA 构建证据也不可达。
- **修复建议：** 在合适的 Setup 或实现任务中补充 Vite HTML 与浏览器启动入口的准确仓库路径、创建责任、依赖和可验证完成证据，并确保这些路径先于浏览器场景及容器构建可用。

### TASK-SELF-006 T014 的完成证据依赖后续任务，依赖链不可执行

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `contradiction`
- **证据：** `T014` 依赖 `T013`，却要求 `T009`、`T011` 均通过。`T009` 明确包含 `apps/web/src/speech/recognizer.test.ts`，对应生产 recognizer 到后续 `T015` 才实现；`T011` 要求有效范围“可发起”，而发起/状态控制到后续 `T021`、`T022` 才实现。与此同时 `T015` 又依赖 `T014`，Phase 4 依赖 `T015`。因此 Coding 无法在不违反任务顺序的情况下满足 `T014` 完成证据，形成环状的隐含依赖。
- **修复建议：** 将 `T014` 的完成证据限定为其实际负责的候选集合与选择界面断言，或把需要 recognizer、发起控制的断言及通过证据移至相应后续实现任务；同步调整测试拆分和显式依赖，使每项任务可在其声明位置独立完成。

## 通过条件

为 React SPA 的 Vite HTML 和浏览器启动入口补充准确路径及任务覆盖；消除 `T014` 完成证据对 `T015`、`T021`、`T022` 的逆向依赖。再次执行 task-planning 门禁，并确认全部任务可按声明依赖顺序完成且 findings 为空。
