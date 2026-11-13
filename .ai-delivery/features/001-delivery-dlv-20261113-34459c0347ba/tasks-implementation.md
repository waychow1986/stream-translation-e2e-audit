# 实时流式翻译实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T001 [P?] [US?] 描述（准确仓库路径）`
- 每项任务必须引用来源 Intent、Specification 场景、Contract 或技术决策。
- 测试任务必须位于对应生产实现任务之前；测试先完成可执行场景与断言，生产实现随后使其通过。
- CI、部署、Independent QA、UAT、发布、Review 和 Merge 结果属于下游平台证据，不作为 Coding 任务的完成条件。
- 所有真实 Azure 测试仅使用获准的 integration 环境、身份和非敏感语音资产；不得以 stub、health check 或页面 smoke 结果替代。

## 依赖关系

- Phase 1 无前置；`T001` 完成后可并行执行 `T002`、`T003`。
- Phase 2 依赖 `T001`～`T003`；`T004 → T005`，`T006 → T007`，且 `T006` 依赖 `T005`。
- US2 是候选语言与 Speech 接入前置：`T008`～`T012` 依赖 `T007`，完成测试资产后执行 `T013`～`T015`。
- US3 依赖 US2 的有效候选范围与 Speech adapter：`T016`～`T020` 依赖 `T015`，完成测试资产后执行 `T021`～`T022`。
- US1 依赖 US2 的识别结果和 US3 的生命周期边界：`T023`～`T027` 依赖 `T022`，完成测试资产后执行 `T028`～`T029`。
- Phase 6 依赖全部用户故事实现：`T030` 依赖 `T029`；`T031`、`T032` 依赖 `T030`；`T033` 依赖 `T031`、`T032`。

## Phase 1：Setup

- [x] T001 建立 Node.js 22 LTS npm workspaces、锁文件、共享 TypeScript 配置及 web/server/contracts 包清单，固定 React、Vite、Fastify、Speech SDK、Vitest 与 Playwright 依赖（`package.json`、`package-lock.json`、`tsconfig.base.json`、`apps/web/package.json`、`apps/server/package.json`、`packages/contracts/package.json`；来源：TD-001、TD-011；依赖：无；证据：`npm ci` 可由锁文件在 clean runner 重建依赖）
- [x] T002 [P] 配置仅忽略已批准的依赖、构建、覆盖率、测试报告和本地 secret 文件，并从容器上下文排除 Git 元数据、测试报告及 Delivery 制品（`.gitignore`、`.dockerignore`；来源：design.md“Component 边界与项目结构”、TD-009、TD-010；依赖：T001；证据：忽略规则覆盖 `node_modules/`、`dist/`、`coverage/`、`playwright-report/`、`test-results/`、`.env*` 且不吞掉生产源码）
- [x] T003 [P] 建立 Vite、Vitest、TypeScript 与 Playwright 的可复现配置，并创建 Vite HTML、浏览器启动入口和最小 React 应用壳；Playwright 使用真实 Chromium 麦克风输入且不内置 provider stub（`apps/web/index.html`、`apps/web/src/main.tsx`、`apps/web/src/App.tsx`、`apps/web/vite.config.ts`、`apps/web/tsconfig.json`、`apps/web/vitest.config.ts`、`apps/server/tsconfig.json`、`apps/server/vitest.config.ts`、`packages/contracts/tsconfig.json`、`playwright.config.ts`；来源：TD-001、TD-011、design.md“Architecture”“Component 边界与项目结构”“验证环境责任矩阵”；依赖：T001；证据：Vite development server 可从 `apps/web/index.html` 加载 `apps/web/src/main.tsx` 并渲染应用壳且无缺失入口模块，测试发现命令可列出 unit、contract、integration、functional 与 E2E 项目）

## Phase 2：Foundational

- [x] T004 [P] 为共享错误 envelope、稳定错误码、SSE 基础帧和禁止正文进入错误输出编写 contract test（`packages/contracts/src/base.contract.test.ts`；来源：design.md“错误契约”、Constitution 三；依赖：T003；证据：测试覆盖 schema 成功/拒绝、未知字段兼容和无 transcript/subtitle/provider 正文）
- [x] T005 实现 provider 无关的共享 schema、稳定错误类型与 SSE 编解码基础，并导出给 SPA/BFF 使用（`packages/contracts/src/base.ts`、`packages/contracts/src/index.ts`；来源：design.md“Interface 与契约”、TD-001；依赖：T004；证据：T004 通过且 contracts 包可独立类型检查）
- [x] T006 [P] 为启动配置校验、Origin/Content-Type/CSP 安全头、正文脱敏日志、静态 SPA 服务及 live/ready 语义编写 Fastify contract test（`apps/server/src/app.contract.test.ts`、`apps/server/src/config.test.ts`；来源：design.md“安全、隐私、身份与 Secret”“配置、可观测性与运维”；依赖：T003、T005；证据：测试覆盖无效配置 readiness 503、同源拒绝、安全头及日志不含正文和凭据）
- [x] T007 建立 Fastify 应用壳、严格启动配置、同源校验、脱敏结构化日志、静态资源和独立 live/ready 路由，不调用外部依赖伪造 readiness（`apps/server/src/app.ts`、`apps/server/src/config.ts`、`apps/server/src/logging.ts`、`apps/server/src/routes/health.ts`、`apps/server/src/index.ts`；来源：TD-001、TD-004、design.md“配置、可观测性与运维”；依赖：T006；证据：T006 通过，错误响应和日志无会议正文、token、key、Authorization 或 stack trace）

## Phase 3：US2 - 为会议设置候选源语言并自动检测

### 测试

- [ ] T008 [P] [US2] 为语言目录、1～10 个去重 BCP 47 tag、目录外 tag 拒绝及 Speech 短期 token 响应编写 API contract test，并断言语言目录与 token 的成功响应均禁止缓存（`apps/server/src/routes/speech.contract.test.ts`、`packages/contracts/src/speech.contract.test.ts`；来源：US-002、FR-002、FR-003、GET `/api/source-languages`、POST `/api/speech/token`；依赖：T007；证据：覆盖 1、10、0、11、重复、不支持 tag、STS 失败，且两个成功响应的 `Cache-Control: no-store` 断言均通过）
- [ ] T009 [P] [US2] 为候选集合校验与运行中不可修改编写 candidate focused unit test，并为 finalized result 候选内检测及缺失/越界检测中断编写 recognizer focused unit test（`apps/web/src/speech/candidate-languages.test.ts`、`apps/web/src/speech/recognizer.test.ts`；来源：FR-002、FR-003、AC-002、AC-003、TD-003；依赖：T007；证据：两个定向测试文件分别证明候选集合不被默认、截断或静默替换，以及 recognizer 仅接受候选内非空 finalized result）
- [ ] T010 [P] [US2] 准备获准且不含会议正文或敏感语音的测试短句音频与 manifest，并编写真实 Azure Speech integration 场景，验证 1 种与 10 种候选配置、范围内各语言 continuous LID、token 获取/刷新失败和检测越界中断；manifest 的每个条目必须把对应文件路径、候选语言 BCP 47 tag 与非正文 `contentId` 关联，场景按条目为每种候选语言单独启动 Chromium，并通过 `--use-file-for-fake-audio-capture=<对应文件路径>` 将该文件作为浏览器麦克风输入（`tests/e2e/integration/speech-lid.spec.ts`、`tests/e2e/assets/approved-speech-manifest.json`、`tests/e2e/assets/speech/candidate-01.wav`、`tests/e2e/assets/speech/candidate-02.wav`、`tests/e2e/assets/speech/candidate-03.wav`、`tests/e2e/assets/speech/candidate-04.wav`、`tests/e2e/assets/speech/candidate-05.wav`、`tests/e2e/assets/speech/candidate-06.wav`、`tests/e2e/assets/speech/candidate-07.wav`、`tests/e2e/assets/speech/candidate-08.wav`、`tests/e2e/assets/speech/candidate-09.wav`、`tests/e2e/assets/speech/candidate-10.wav`；来源：IQA-002、IQA-003、AC-002、AC-003、TD-011、design.md“验证环境责任矩阵”“快速验证指南”；依赖：T007；证据：十个语音文件均存在且为可被 Chromium 读取的获准非敏感音频，manifest 中每个文件引用均可解析到仓库内对应文件并具有候选 tag 与 `contentId`，场景实际使用所引用文件取得对应检测 tag 和 candidate 标识）
- [ ] T011 [P] [US2] 编写候选选择界面的浏览器 functional 场景，验证语言目录展示、无默认语言、一种与十种候选选择，以及空范围、超过十种或目录外 tag 的可观察校验和修正（`tests/e2e/functional/candidate-language-selection.spec.ts`；来源：IQA-002、FR-002、AC-002；依赖：T007；证据：断言候选集合与选择界面的用户操作、校验状态和修正结果，不要求 recognizer 或发起控制已实现）
- [ ] T012 [P] [US2] 编写完整 Playwright E2E 场景，验证多候选语言无需逐段指定即可被真实检测并进入中文字幕流程（`tests/e2e/journeys/automatic-language-detection.spec.ts`；来源：IQA-003、FR-003、FR-004、AC-003；依赖：T007；证据：关联真实语音、候选范围、检测结果和页面中文字幕，且不是页面 smoke）

### 实现

- [ ] T013 [US2] 实现配置驱动且启动时校验的权威语言目录、Speech STS 短期 token endpoint 和对应共享 schema，为语言目录与 token 的成功响应设置 `Cache-Control: no-store`，且不缓存或记录 token（`packages/contracts/src/speech.ts`、`apps/server/src/adapters/speech-token.ts`、`apps/server/src/routes/speech.ts`；来源：FR-002、GET `/api/source-languages`、POST `/api/speech/token`、TD-003、TD-004；依赖：T008～T012；证据：T008 全部通过，包括两个成功响应的禁止缓存断言，且目录无效使 readiness 503）
- [ ] T014 [US2] 实现候选语言加载、去重选择、1～10 边界校验和修正界面，将选择界面接入应用壳，运行中锁定选择且不添加默认语言（`apps/web/src/components/LanguageSelector.tsx`、`apps/web/src/speech/candidate-languages.ts`、`apps/web/src/App.tsx`；来源：US-002、FR-002、SC-002、AC-002；依赖：T013；证据：`apps/web/src/speech/candidate-languages.test.ts` 和 T011 通过，仅证明候选集合与选择界面责任）
- [ ] T015 [US2] 实现浏览器 Speech SDK continuous recognition/continuous LID adapter，将所选 tag 原样配置给单个 recognizer，只提交候选内非空 finalized segment，并把 token、采集及检测失败映射为中断（`apps/web/src/speech/recognizer.ts`、`apps/web/src/speech/types.ts`；来源：FR-001、FR-003、AC-003、TD-002、TD-003；依赖：T014；证据：`apps/web/src/speech/recognizer.test.ts` 通过，并具备执行 T010、T012 的真实环境命令）

## Phase 4：US3 - 控制实时字幕流程边界

### 测试

- [ ] T016 [P] [US3] 为 run state、generation、允许转换及稳定 interruption stage 编写共享 contract test（`packages/contracts/src/run.contract.test.ts`；来源：US-003、FR-005～FR-008、design.md“状态转换”；依赖：T015；证据：覆盖 `idle|starting|running|interrupted|stopping|stopped` 及非法转换拒绝）
- [ ] T017 [P] [US3] 为发起、运行中停止、中断后停止、重复停止、共享终止 promise、清理失败、晚到 callback、FIFO 清空和重新发起编写 focused unit test（`apps/web/src/run/run-controller.test.ts`；来源：FR-005～FR-008、AC-005～AC-008、TD-008；依赖：T015；证据：证明停止意图优先、幂等释放及旧 generation 不能回写）
- [ ] T018 [P] [US3] 编写浏览器与真实 Speech 生命周期 integration 场景，验证 recognizer/microphone/fetch 的发起、abort、close、token 失败中断和新 generation 重建（`tests/e2e/integration/run-lifecycle.spec.ts`；来源：FR-005～FR-008、TD-008、design.md“验证环境责任矩阵”；依赖：T015；证据：记录不含正文的状态、generation、资源关闭与后续新会话关联）
- [ ] T019 [P] [US3] 编写候选范围发起边界、手动发起、运行中停止、中断时停止、重复停止及重新发起的浏览器 functional 场景（`tests/e2e/functional/run-controls.spec.ts`；来源：IQA-002、IQA-005、IQA-006、IQA-008、AC-002、AC-005、AC-006、AC-008；依赖：T015；证据：断言空范围、超过十种或目录外 tag 不请求麦克风/recognizer，有效范围可发起，停止后无新增采集/字幕，中断提示被已停止替换且允许再次发起）
- [ ] T020 [P] [US3] 编写完整 Playwright E2E 生命周期场景，覆盖停止后与中断条件消除后的手动重新发起、不补发期间内容及后续语音恢复中文字幕（`tests/e2e/journeys/stop-and-restart.spec.ts`；来源：IQA-005、IQA-006、IQA-008、FR-005、FR-006、FR-008；依赖：T015；证据：关联真实输入、状态转换、停止期间无输出和新 generation 的中文字幕）

### 实现

- [ ] T021 [US3] 实现共享 run/interruption schema 以及浏览器 generation 状态机和可重入终止协调器，统一释放 track、recognizer、fetch 与 FIFO（`packages/contracts/src/run.ts`、`apps/web/src/run/run-controller.ts`、`apps/web/src/run/resource-terminator.ts`；来源：FR-005～FR-008、TD-008、design.md“停止、中断与并发”；依赖：T016～T020；证据：T016、T017 通过）
- [ ] T022 [US3] 实现发起、停止、重新发起控制和未启动/运行中/中断/已停止用户可见状态，页面卸载仅 best-effort 清理且不保存状态（`apps/web/src/components/RunControls.tsx`、`apps/web/src/components/RunStatus.tsx`、`apps/web/src/App.tsx`；来源：US-003、FR-005～FR-008、AC-005～AC-008；依赖：T021；证据：T019 通过，并具备执行 T018、T020 的真实环境命令）

## Phase 5：US1 - 会议中查看连续中文字幕

### 测试

- [ ] T023 [P] [US1] 为翻译请求、配置的请求体安全上限、错误 envelope、SSE delta/completed/error、取消、未知事件、越序/重复事件和兼容字段编写 API/adapter contract test，覆盖超限拒绝及 translation 中断映射（`packages/contracts/src/translation.contract.test.ts`、`apps/server/src/routes/translations.contract.test.ts`；来源：POST `/api/translations:stream`、design.md“错误契约”“安全、隐私、身份与 Secret”、TD-006、TD-007；依赖：T022；证据：验证响应头、abort、错误映射且不泄露 transcript/provider 正文；边界内请求按契约处理，超限请求被明确拒绝并映射为中断，原文不被截断或拆分且 Foundry adapter 未被调用）
- [ ] T024 [P] [US1] 为 finalized-only、严格 sequence FIFO、增量字幕、完成后出队、晚到事件丢弃和每次新发起清空字幕编写 focused unit test（`apps/web/src/translation/translation-queue.test.ts`、`apps/web/src/components/Subtitles.test.tsx`；来源：FR-004、NFR-001、TD-005、TD-009；依赖：T022；证据：证明每个 sequence 最多提交一次且字幕不使用 interim 或 HTML 注入）
- [ ] T025 [P] [US1] 编写真实 Foundry integration 场景，验证 Managed Identity、`gpt-sol-6.1` Responses streaming、`reasoning.effort: "none"`、文本事件、取消及不兼容协议阻断（`tests/e2e/integration/foundry-translation.spec.ts`；来源：INT-006、FR-004、TD-007、design.md“验证环境责任矩阵”；依赖：T022；证据：关联非敏感输入、中文增量、完成事件和 candidate 标识，不接受换模或 stub 结果）
- [ ] T026 [P] [US1] 编写连续字幕与各阶段中断可见的浏览器 functional 场景（`tests/e2e/functional/continuous-subtitles-and-interruptions.spec.ts`；来源：IQA-001、IQA-004、IQA-007、AC-001、AC-004、AC-007；依赖：T022；证据：分别覆盖 capture、speech、language-detection、translation 中断及无伪装字幕）
- [ ] T027 [P] [US1] 编写真实完整 Playwright E2E 场景，验证连续多段候选内语音在会议期间按序形成中文字幕，并在中断后可手动停止（`tests/e2e/journeys/live-continuous-subtitles.spec.ts`；来源：IQA-001、IQA-004、IQA-007、NFR-001；依赖：T022；证据：关联可核验语音、运行状态、真实 Azure 服务、连续页面字幕及 `interrupted → stopped`）

### 实现

- [ ] T028 [US1] 实现翻译共享 schema、Foundry Managed Identity adapter 和同源 SSE route，按已验证的 Foundry 单次请求能力配置请求体安全上限，超限时明确拒绝并映射为 translation 中断，不截断、不拆分且不调用上游；同时固定 deployment、结构化 role/content、流式输出、关闭 reasoning、禁用内容重放重试并在客户端断开时 abort 上游（`packages/contracts/src/translation.ts`、`apps/server/src/adapters/foundry.ts`、`apps/server/src/routes/translations.ts`；来源：FR-004、POST `/api/translations:stream`、design.md“安全、隐私、身份与 Secret”、TD-004、TD-006、TD-007；依赖：T023～T027；证据：T023 全部通过，包括超限拒绝、中断映射、不截断、不拆分及上游零调用断言，并具备执行 T025 的真实环境命令）
- [ ] T029 [US1] 实现当前 generation 的 finalized segment FIFO、POST SSE parser、按 sequence 增量中文字幕渲染及 translation 中断映射，不持久化或补发内容（`apps/web/src/translation/sse-client.ts`、`apps/web/src/translation/translation-queue.ts`、`apps/web/src/components/Subtitles.tsx`、`apps/web/src/App.tsx`；来源：US-001、FR-001、FR-004、FR-007、NFR-001、TD-005、TD-009；依赖：T028；证据：T024、T026 通过，并具备执行 T027 的真实环境命令）

## Phase 6：Polish

- [ ] T030 为全部 Playwright 场景统一非敏感输入清单、candidate/session/sequence/状态/可见输出证据关联和 secret/会议正文排除规则，不添加未批准质量阈值（`tests/e2e/support/evidence.ts`、`tests/e2e/assets/approved-speech-manifest.json`、`playwright.config.ts`；来源：IQA-001～IQA-008 必需证据、Constitution 三和四、design.md“验证环境责任矩阵”；依赖：T029；证据：所有场景可生成不含凭据的结构化证据索引，真实 Azure 结果仍由下游环境产生）
- [ ] T031 [P] 创建单一多阶段 Node.js 22 LTS Linux image，以 lockfile 构建 SPA/BFF、只复制 production 产物、使用非 root 用户并提供配置化 `PORT`（`Dockerfile`；来源：TD-010、design.md“部署拓扑、迁移、Rollout 与 Rollback”；依赖：T030；证据：本地 candidate image 可构建且源码测试资产、开发依赖、`.env` 和 Delivery 报告不进入 runtime layer）
- [ ] T032 [P] 声明 Container Apps 部署契约、只读应用文件系统、端口、live/ready、非 secret 配置名、secret/Managed Identity 引用、幂等 clean-runner setup，以及唯一分类的 `staticAnalysis`、`build`、`developerTests` 和实际提供的 `integrationTests`、`functionalTests` 命令（`.ai-delivery/features/001-delivery-dlv-20261113-34459c0347ba/runtime/deployment.json`；来源：design.md“部署拓扑、迁移、Rollout 与 Rollback”“验证环境责任矩阵”、平台 runtime contract；依赖：T030；证据：部署契约明确生产应用文件系统只读，JSON 不含 secret 值、命令非 no-op 且各分类内唯一）
- [ ] T033 在 clean working tree 按部署契约顺序执行 setup、静态分析、构建和 developer tests，并以只读文件系统启动 Docker image，验证非 root 身份、应用路径写入失败及 live/ready 辅助检查仍可通过；仅确认真实 integration/functional 命令可发现场景，不伪造无 Azure 环境的通过结果（`package-lock.json`、`.ai-delivery/features/001-delivery-dlv-20261113-34459c0347ba/runtime/deployment.json`、`Dockerfile`；来源：design.md“部署拓扑、迁移、Rollout 与 Rollback”“快速验证指南”、TD-010、TD-011；依赖：T031、T032；证据：保留可复现的只读启动、非 root、应用路径写入被拒绝和 live/ready 检查的真实 stdout/stderr 与退出码，以及其余本地命令结果；首次失败即停止）

## 完成证据

- Setup 与 Foundational：锁文件 clean install、类型/测试配置可发现，以及共享 contract、配置、安全头、脱敏日志和 health 测试结果。
- US2：contract 与 focused unit test 通过；Coding 提供真实 Speech integration、functional 和 E2E 自动化及获准非敏感输入清单。真实 Azure 语言检测结果由后续 integration/QA 环境产生。
- US3：状态机与资源终止测试通过；Coding 提供手动发起、运行中及中断后停止、重复停止和重新发起的真实浏览器自动化。远程执行结果由下游环境产生。
- US1：翻译 contract、FIFO/SSE focused unit 和本地 functional 测试通过；Coding 提供真实 Foundry integration 与完整 Playwright 连续字幕自动化。真实 Azure 中文字幕结果由后续 integration/QA 环境产生。
- Candidate readiness：`Dockerfile`、`runtime/deployment.json`、clean-runner setup 与分类验证命令在 Coding 中完成并可复现；不得把未来的最终 commit SHA、image digest、远程 deployment/QA target、Independent QA、UAT、发布审批、Review 或 Merge 结果写成 Coding 完成条件。
