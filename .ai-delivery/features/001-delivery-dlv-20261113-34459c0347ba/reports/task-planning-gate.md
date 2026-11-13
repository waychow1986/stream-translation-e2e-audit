# Task Planning 阶段门禁报告

## 门禁信息

- **阶段：** `task-planning`
- **检查轮次：** 2
- **当前制品：** `tasks-implementation.md`
- **直接前置制品：** `design.md`
- **结论：** `需要修复`

## 内部自检

已检查全部 33 项任务的完整性、依赖顺序、可执行性、准确路径、测试先行顺序和完成证据。任务按 Setup、Foundational、US2、US3、US1、Candidate readiness 形成可执行依赖链；对应 contract、unit、integration、functional 和完整 Playwright E2E 测试均先于生产实现，且未来 CI、远程部署、Independent QA、UAT、发布、Review 和 Merge 结果未被错误设为 Coding 完成条件。

上一轮三个阻塞项均已由当前制品实质修复：`T023`/`T028` 已覆盖翻译请求体安全上限及超限行为，`T008`/`T013` 已覆盖语言目录成功响应的 `Cache-Control: no-store`，`T032`/`T033` 已覆盖生产应用文件系统只读声明与验证。

当前仍缺少真实浏览器麦克风测试所需非敏感语音文件的创建或引入任务及准确路径。仅声明输入清单不能使相关 Speech integration 与完整 E2E 场景可执行，因此尚未达到实施就绪。

## 直接前置一致性检查

已逐节核对 `design.md` 的机器可读根路径、组件职责、接口与错误契约、安全边界、状态和生命周期、部署约束、验证责任矩阵及 Quickstart，并仅使用 `spec.md` 的 `IQA-001`～`IQA-008` 检查继承的验收场景追踪。Tasks 已忠实覆盖主要架构、状态机、Speech/Foundry adapter、SSE、容器和部署契约。

但 Design 明确要求在 `tests/e2e/` 提供获准的非敏感语音资产，并以真实 Chromium 麦克风输入执行 Speech 与完整用户流程。当前 Tasks 只列出资产清单 JSON，没有任何实际语音文件路径或负责准备这些文件的任务。该 Design 决策清晰、可执行且无上游异常，遗漏责任属于当前 `task-planning` 阶段。

## 阻塞项

### TASK-SELF-004 真实麦克风测试缺少语音资产任务与准确路径

- **严重性：** `high`
- **范围：** `self`
- **制品：** `tasks-implementation.md`
- **责任 Agent：** `task-planning`
- **路由：** `current_stage`
- **原因类型：** `coverage`
- **证据：** `design.md` 第 123～124 行把 Playwright 真实环境场景与获准的非敏感语音资产置于 `tests/e2e/`，第 308～310 行要求 Speech integration 和完整浏览器 E2E 使用 Chromium 麦克风输入及可核验非敏感语音。`T010` 与 `T030` 仅指定 `tests/e2e/assets/approved-speech-manifest.json`，`T003` 仅配置真实麦克风输入；全部 33 项任务均未指定任何实际语音文件路径，也没有任务负责创建或引入清单所引用的语音文件。因而 `T010`、`T012`、`T018`、`T020`、`T027` 所需真实输入无法仅由任务清单落地和执行。
- **修复建议：** 增加测试先行的资产准备任务，或修订现有测试资产任务，明确获准非敏感语音文件的准确仓库路径、与 manifest 中候选语言及内容标识的关联、被 Playwright Chromium 麦克风输入使用的方式，以及文件存在且清单引用有效的完成证据；不得写入会议正文或敏感语音。

## 通过条件

修订 `tasks-implementation.md`，为真实 Speech integration 与完整 Playwright E2E 所需的获准非敏感语音文件补充准确路径、准备责任、依赖关系和可核验完成证据；再次执行 task-planning 门禁并确认 findings 为空。
