# V2 实时流式翻译字幕（边说边出）实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T### [P?] [US#?] 描述（路径；来源：…；依赖：…）`
- 路径必须位于 design 的“Component 边界与项目结构”授权范围或其中明确列出的平台固定授权范围内。
- 每项任务引用 Specification 的用户故事、需求、验收场景或 design 的 Contract、技术决策。
- 各用户故事的测试任务先于对应生产实现；测试素材由 Coding 合成并提交。
- 候选验证、部署、Independent QA、UAT、发布和合并结果属于下游平台证据，不作为 Coding 任务。

## 依赖关系

- Setup 为后续测试与实现提供锁定工具链、配置和可重复合成素材。
- Foundational 阶段建立共享契约及安全的单进程服务骨架，阻塞所有用户故事。
- 用户故事按 `US1 → US2 → US3 → US4` 的顺序集成；每个故事内部先完成测试，再完成生产实现。
- Polish 仅完成 design 已批准的容器与候选验证就绪制品，依赖全部用户故事完成。

## Phase 1：Setup

- [ ] T001 初始化 Node.js 22 LTS 锁定工具链，使用包管理器将 TypeScript 5、React 19、Vite 7、Fastify 5、Microsoft Cognitive Services Speech SDK 1.53、Azure Identity、OpenAI JavaScript SDK 7 与 Playwright 逐项锁定到 `package-lock.json`，生成 `staticAnalysis`、`build`、`developerTests`、`integrationTests`、`functionalTests` 对应 npm scripts，并在相关构建、测试命令前后清理 `dist`、`coverage`、`test-results`、`playwright-report`（`package.json`、`package-lock.json`；来源：TD-002、design“技术上下文”、design“Component 边界与项目结构”、验证环境责任矩阵；依赖：无）
- [ ] T002 配置 TypeScript 5、React 19、Vite 7 与 Playwright 的构建、测试和本地服务入口，并编写先行静态 contract 测试逐项核验锁文件中的固定栈版本、npm scripts 的四类输出清理以及验证后这些输出不构成交付改动（`tsconfig.json`、`vite.config.ts`、`playwright.config.ts`、`tests/contract/toolchain.test.ts`；来源：TD-002、TD-009、design“技术上下文”、design“Component 边界与项目结构”；依赖：T001）
- [ ] T003 [P] 合成并提交可重复的英文流式、英文双片段、至少 15 秒连续英文、中文流式及超视窗多片段 WAV，并以 UTF-8 manifest 记录文本、语言、片段和时长（`test-assets/audio/en-stream.wav`、`test-assets/audio/en-two-segments.wav`、`test-assets/audio/en-continuous-15s.wav`、`test-assets/audio/zh-stream.wav`、`test-assets/audio/multi-segment.wav`、`test-assets/audio/manifest.json`；来源：IQA-001—IQA-006、TD-009；依赖：无）

## Phase 2：Foundational

- [ ] T004 为环境配置 fail-fast、共享请求/事件 schema、平台端点、同源校验、CSP、安全响应头和日志正文/token 脱敏编写先行 contract 测试（`tests/contract/server-foundation.test.ts`、`tests/contract/security.test.ts`；来源：Contract `GET /healthz`、Contract `GET /candidate-identity`、TD-002、design“安全、隐私、身份与 Secret”；依赖：T001、T002）
- [ ] T005 实现 `CaptionSegment`、`CaptionState`、`TranslationRequest`、`TranslationEvent` 及严格运行时校验的共享契约（`src/shared/contracts.ts`、`src/shared/schemas.ts`；来源：design“领域与数据模型”、design“Interface 与契约”；依赖：T004）
- [ ] T006 实现必需环境变量校验、脱敏结构化日志、Fastify 启停、静态资源服务、`/healthz`、`/candidate-identity`、同源保护与安全响应头，使 T004 通过且不访问外部依赖（`src/server/config.ts`、`src/server/logger.ts`、`src/server/security.ts`、`src/server/app.ts`、`src/server/index.ts`；来源：Contract `GET /healthz`、Contract `GET /candidate-identity`、TD-002、design“配置、可观测性与运维”；依赖：T005）

## Phase 3：US1 - 发言过程中查看流式中文字幕

### 测试

- [ ] T007 [P] [US1] 为 `/api/config`、Speech Entra token 格式、缓存合并、服务端提前 5 分钟刷新、浏览器提前 2 分钟刷新及错误不泄露编写先行 contract 测试（`tests/contract/speech-token.test.ts`；来源：US-001、Contract `GET /api/config`、Contract `POST /api/speech-token`、TD-001；依赖：T006）
- [ ] T008 [P] [US1] 为 `en-US`/`zh-CN` continuous recognition 与 language identification、interim/final/NoMatch 分派、token 原位刷新、停止/卸载资源清理，以及语言无法确定时清除 current、保持 fixed、不自动重放且用户重新触发后建立新会话编写先行单元测试（`tests/unit/speech-adapter.test.ts`、`tests/unit/session-lifecycle.test.ts`；来源：US-001、FR-001、FR-002、AC-001、TD-003、design“数据流、状态、并发与生命周期”；依赖：T006）
- [ ] T009 [P] [US1] 使用协议级 fake adapter 编写 Playwright 先行功能测试，证明用户授权后可开始、发言未结束即产生可继续更新的当前片段，并暴露稳定的 draft/final DOM 状态（`tests/e2e/streaming-session.spec.ts`；来源：US-001、IQA-001、NFR-001、AC-001；依赖：T003、T006）

### 实现

- [ ] T010 [P] [US1] 实现 `DefaultAzureCredential` Speech token provider、并发缓存刷新以及 `/api/config`、`/api/speech-token` 严格同源接口，使 T007 通过（`src/server/azure-credential.ts`、`src/server/speech-token.ts`、`src/server/routes/config.ts`、`src/server/routes/speech-token.ts`；来源：US-001、TD-001、Contract `GET /api/config`、Contract `POST /api/speech-token`；依赖：T007、T008、T009）
- [ ] T011 [P] [US1] 实现浏览器 Speech SDK adapter，固定英中候选、启用连续识别与语言检测，映射 interim/final/NoMatch、拒绝未确定语言并支持 authorization token 原位刷新（`src/client/speech-adapter.ts`、`src/client/speech-types.ts`；来源：US-001、FR-001、FR-002、TD-001、TD-003、design“数据流、状态、并发与生命周期”；依赖：T007、T008、T009）
- [ ] T012 [US1] 实现 React 入口、用户触发的麦克风会话、开始/停止/卸载生命周期和可注入协议 adapter，使流式会话测试通过；停止、卸载或语言无法确定时清理 current 与资源、保持 fixed、不自动重放，用户重新触发时建立全新会话（`index.html`、`src/client/main.tsx`、`src/client/App.tsx`、`src/client/session-controller.ts`、`src/client/styles.css`；来源：US-001、FR-001、AC-001、design“数据流、状态、并发与生命周期”、design“SLO、限制、扩缩容、重试与恢复”；依赖：T010、T011）

## Phase 4：US2 - 查看英文草稿与最终译文

### 测试

- [ ] T013 [P] [US2] 为翻译请求 schema、16 KiB/4000 code units 限制、NDJSON delta/completed/error、取消传播、并发保护及错误脱敏编写先行 contract 测试；固定 Foundry `stream=true`、`store=false`、`reasoning.effort=none`、只负责忠实简体中文翻译的 system instruction 和正文 JSON data 封装，并以含指令的正文证明其不能改变翻译职责；验证服务终止时先拒绝新请求、再取消全部在途 Foundry 流、最后关闭监听（`tests/contract/translation-api.test.ts`、`tests/contract/foundry-adapter.test.ts`、`tests/contract/server-shutdown.test.ts`；来源：US-002、FR-004—FR-006、Contract `POST /api/translations`、TD-006、design“数据流、状态、并发与生命周期”；依赖：T012）
- [ ] T014 [P] [US2] 为 400 ms 静默/2 秒持续更新调度、latest-wins 取消、稳定内容判定、revision/requestId 乱序拒绝、final 优先及 fixed 不可变编写 fake clock 单元测试，并验证超 4000 code units 的片段终止且不拆分、依赖失败清除 current 且保持 fixed、不自动重试或重放、用户重新触发后建立新会话（`tests/unit/translation-scheduler.test.ts`、`tests/unit/caption-reducer-en.test.ts`、`tests/unit/recovery-behavior.test.ts`；来源：US-002、FR-004—FR-006、FR-008、TD-004—TD-007、design“领域与数据模型”、design“SLO、限制、扩缩容、重试与恢复”；依赖：T012）
- [ ] T015 [P] [US2] 使用合成英文协议输入编写 Playwright 先行功能测试，覆盖草稿首现与修订、final 完整译文原位替换并固定、后续片段不改写，以及 6 秒/5 秒/3 秒边界的单调时钟判定（`tests/e2e/english-captions.spec.ts`；来源：US-002、IQA-001、IQA-002、IQA-005、AC-002—AC-004、AC-008；依赖：T003、T012）

### 实现

- [ ] T016 [P] [US2] 实现 Foundry Responses API adapter 与 `/api/translations`，固定 stream、store=false、reasoning none、只负责忠实简体中文翻译且不得执行正文指令的 system instruction，将语音正文仅封装为 JSON data，完成 NDJSON 映射、取消传播和 32 流并发保护；维护在途流注册表，并在服务终止时依次停止接收新请求、取消全部在途 Foundry 请求、最后关闭监听（`src/server/foundry-adapter.ts`、`src/server/routes/translations.ts`、`src/server/app.ts`、`src/server/index.ts`；来源：US-002、FR-004—FR-006、TD-006、Contract `POST /api/translations`、design“数据流、状态、并发与生命周期”；依赖：T013、T014、T015）
- [ ] T017 [P] [US2] 实现浏览器 NDJSON translation client 与稳定内容 latest-wins 调度器，确保新 revision 首个 delta 到达前保留上一草稿且过期流不能覆盖；片段超过 4000 code units 时终止而不拆分，依赖失败时取消处理且不自动重试或重放（`src/client/translation-client.ts`、`src/client/translation-scheduler.ts`；来源：US-002、FR-004、FR-005、TD-004—TD-006、design“领域与数据模型”、design“SLO、限制、扩缩容、重试与恢复”；依赖：T013、T014、T015）
- [ ] T018 [P] [US2] 实现英文 caption reducer 的 draft、finalizing、fixed 单向状态与 segment/revision/requestId 代次守卫，并在超限、取消或依赖失败时仅清除 current、保持 fixed 不变（`src/client/caption-reducer.ts`；来源：US-002、FR-005、FR-006、FR-008、TD-007、design“数据流、状态、并发与生命周期”；依赖：T013、T014、T015）
- [ ] T019 [US2] 将英文 Speech interim/final、调度器、翻译流、错误清理和字幕状态接入会话与 UI，使 T013—T015 全部通过，并保证失败后仅由用户重新触发建立全新会话（`src/client/session-controller.ts`、`src/client/App.tsx`；来源：US-002、FR-004—FR-006、SC-001、SC-002、design“SLO、限制、扩缩容、重试与恢复”；依赖：T016、T017、T018）

## Phase 5：US3 - 查看中文识别原文

### 测试

- [ ] T020 [P] [US3] 为中文 interim 原文直显、更新、final 固定、后续事件不可改写及绝不调用翻译接口编写先行单元测试（`tests/unit/caption-reducer-zh.test.ts`、`tests/unit/language-routing.test.ts`；来源：US-003、FR-003、FR-007、FR-011、AC-005、AC-009；依赖：T019）
- [ ] T021 [P] [US3] 使用合成中文协议输入编写 Playwright 先行功能测试，覆盖原文逐步更新、无翻译/改写、final 固定及后续片段期间内容不变（`tests/e2e/chinese-captions.spec.ts`；来源：US-003、IQA-003、IQA-006、SC-003、SC-006；依赖：T003、T019）

### 实现

- [ ] T022 [US3] 实现中文语言路由，将 interim 原文作为当前 draft 更新、final 完整原文直接固定并绕过 Foundry，使 T020—T021 通过（`src/client/session-controller.ts`、`src/client/caption-reducer.ts`；来源：US-003、FR-002、FR-003、FR-007、FR-011；依赖：T020、T021）

## Phase 6：US4 - 跟随连续新增字幕

### 测试

- [ ] T023 [P] [US4] 为唯一尾部 current、fixed append-only、跨片段追加顺序和旧 fixed 对象不可更新编写先行单元测试（`tests/unit/caption-list.test.ts`；来源：US-004、FR-008、FR-009、TD-007；依赖：T022）
- [ ] T024 [P] [US4] 使用超出视窗容量的多片段合成输入编写 Playwright 先行功能测试，验证固定视窗尺寸不扩展、字幕从底部追加、提交后自动跟随底部且既有 fixed 不变（`tests/e2e/caption-viewport.spec.ts`；来源：US-004、IQA-004、AC-006、AC-007；依赖：T003、T022）

### 实现

- [ ] T025 [US4] 实现固定字幕列表、唯一尾部草稿和提交后滚动到底部的固定视窗组件，并接入应用使 T023—T024 通过（`src/client/CaptionViewport.tsx`、`src/client/caption-reducer.ts`、`src/client/App.tsx`、`src/client/styles.css`；来源：US-004、FR-008—FR-010、SC-004、TD-007；依赖：T023、T024）

## Phase 7：Polish

- [ ] T026 为生产构建产物、容器数字非 root UID/端口/启动契约，以及 deployment 命令分类、health、candidate identity、无 PostgreSQL 和公网网络声明编写先行静态 contract 测试（`tests/contract/deployment.test.ts`；来源：TD-010、design“部署拓扑、迁移、Rollout 与 Rollback”、design“配置、可观测性与运维”；依赖：T025）
- [ ] T027 [P] 创建 Node.js 22 多阶段生产镜像，安装锁定依赖、构建前后端、仅携带运行所需文件，以数字 UID 10001 监听 8080，并排除测试结果、临时输出和凭据（`Dockerfile`、`.dockerignore`；来源：TD-002、TD-010、design“部署拓扑、迁移、Rollout 与 Rollback”；依赖：T026）
- [ ] T028 [P] 声明候选容器端口、健康与身份路径、无私网/无 PostgreSQL，以及 clean runner setup 和 staticAnalysis→build→developerTests→integrationTests→functionalTests 顺序命令（`.ai-delivery/features/003-v1/runtime/deployment.json`；来源：design“配置、可观测性与运维”、design“快速验证指南”；依赖：T026）

## 完成证据

- Setup：锁文件可在 clean runner 复现安装并逐项匹配 Node.js 22 LTS、TypeScript 5、React 19、Vite 7、Fastify 5、Speech SDK 1.53、Azure Identity、OpenAI JavaScript SDK 7 与 Playwright 的固定栈；构建和测试前后自动清理 `dist`、`coverage`、`test-results`、`playwright-report`，验证结束后这些输出不构成交付改动；所有合成 WAV 与 manifest 可读取且覆盖指定场景。
- Foundational：共享 schema、配置、安全、日志和平台端点 contract 测试通过，日志及错误响应不含正文、token 或请求体。
- US1：单元、contract 与本地 Playwright 辅助测试证明授权后可持续产生 interim，且 token 刷新、停止清理、语言无法确定时保持 fixed 和手动新会话恢复符合契约。
- US2：contract、fake clock 单元与本地 Playwright 辅助测试证明英文草稿修订、final 固定、乱序保护、超限终止不拆分、依赖失败不自动重试、提示注入边界、服务有序终止及获批时限判定逻辑。
- US3：单元与本地 Playwright 辅助测试证明中文原文流式直显、绕过翻译并在 final 后不可变。
- US4：单元与本地 Playwright 辅助测试证明 append-only fixed 列表、底部追加和固定视窗自动跟随。
- Polish：按 `deployment.json` 在本地或 clean runner 依序执行全部开发者验证命令均成功，生产镜像可构建且其用户解析为正整数非 root UID，静态部署契约测试通过。
- 真实 Azure Speech/Foundry 集成、AKS 健康与候选身份、`IQA-001`—`IQA-006`、NFR-002 黑盒时限、Independent QA、UAT、发布审批与合并结果均由下游平台阶段产生，不以 Coding 的 fake adapter、构建或 health check 替代。
