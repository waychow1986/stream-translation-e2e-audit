# 实时流式翻译实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T### [P?] [US#?] 描述（路径；来源：…；依赖：…）`
- 路径必须位于 design 的“Component 边界与项目结构”路径清单或其明确授权的平台固定制品内。
- 每项任务引用 Specification 中的用户故事、需求、验收标准、验收场景或 design 中的 Contract、技术决策。
- 各用户故事的测试任务先于对应生产实现任务；合成素材提交到 design 指定的测试路径。
- 候选验证、部署、Independent QA、UAT、发布和合并结果属于延后的平台证据，不作为 Coding 任务。

## 依赖关系

- Setup 提供锁定依赖、编译配置和输出隔离；Foundational 在其上建立共享协议、配置、HTTP 契约及安全边界。
- US1 依赖 Foundational；US2 依赖 US1 的音频与 Speech 会话骨架；US3 依赖 US1、US2 已形成的英语 finalized segment。
- Polish 仅整合 design 已批准的生命周期、候选验证和容器交付制品，并依赖三个用户故事完成。
- 各任务行中的 `依赖：` 列出直接前置任务；标记 `[P]` 的任务只并行修改无冲突文件。

## Phase 1：Setup

- [x] T001 锁定 Node.js 22、TypeScript、React、Vite、Fastify、Azure SDK、TypeBox、测试工具与 Playwright 依赖，并定义 design 指定的 typecheck、build、unit、contract、e2e 脚本（`package.json`、`package-lock.json`；来源：TD-001、TD-007、design 部署拓扑；依赖：无）
- [x] T002 配置 TypeScript、Vite 和 Playwright，使客户端、服务端、共享代码及本地 Chromium 功能流可构建执行（`tsconfig.json`、`vite.config.ts`、`playwright.config.ts`；来源：TD-001、TD-007、design Quickstart 1～2；依赖：T001）
- [x] T003 [P] 隔离依赖、构建、coverage、Playwright 报告、测试结果、Git 元数据和本地环境文件，且保留合成 fixture（`.gitignore`、`.dockerignore`；来源：design Component 边界、design 部署拓扑；依赖：无）

## Phase 2：Foundational

- [x] T004 [P] 为协议版本、严格消息 schema、音频格式、事件字段、未知字段拒绝及稳定错误码编写先行 contract test（`tests/contract/protocol.contract.test.ts`；来源：design Interface 与契约；依赖：T002）
- [x] T005 实现 TypeBox 协议 schema、共享消息类型和协议版本 1，使 T004 通过（`src/shared/protocol.ts`、`src/shared/types.ts`；来源：design Interface 与契约、AudioFrame、RecognitionSegment、SubtitleSegment；依赖：T004）
- [x] T006 [P] 为必需环境变量、Speech endpoint/ARM resource ID 校验、Foundry endpoint 冲突、deterministic adapter 生产拒绝、health 与 candidate identity 响应编写先行 contract test（`tests/contract/config-http.contract.test.ts`；来源：design HTTP 契约、配置约束、AC-001；依赖：T002）
- [x] T007 实现启动配置校验、Fastify 应用、静态 SPA 托管、`/healthz` 和 `/candidate-identity`，使 T006 通过（`src/server/config.ts`、`src/server/routes.ts`、`src/server/app.ts`、`src/server/index.ts`；来源：design HTTP 契约、配置约束、平台部署约束；依赖：T005、T006）
- [x] T008 为同源 WebSocket、CSP、正文与凭据脱敏日志、非测试环境禁用 test-double evidence 编写先行 contract test（`tests/contract/security.contract.test.ts`；来源：Constitution 三、design 安全与 Secret、dependency.evidence Contract；依赖：T007）
- [x] T009 实现 Origin/Host 校验、安全响应头、结构化脱敏日志和 production adapter 防护，使 T008 通过（`src/server/security.ts`、`src/server/logger.ts`、`src/server/app.ts`；来源：design 安全、隐私、身份与 Secret、配置与可观测性；依赖：T008）

## Phase 3：US1 - 采集并转写会议发言

### 测试

- [x] T010 [P] [US1] 生成并提交 16 kHz 单声道 PCM 多语义片段英语 WAV 及片段时间、英文原意和中文概念词组清单（`tests/fixtures/audio/iqa-en-multisegment.wav`、`tests/fixtures/audio/iqa-en-multisegment.json`；来源：IQA-001、IQA-003、spec 测试策略；依赖：T002）
- [x] T011 [P] [US1] 为 `idle → starting → listening → draining → stopped`、失败终止、stop 截止帧和 stopped 后零业务事件编写先行单元测试（`tests/unit/session-state.test.ts`；来源：US-001、FR-001、AC-001、design SessionState 不变量；依赖：T005）
- [x] T012 [P] [US1] 为 PCM push、continuous recognition、finalized-only 入队、音频顺序、取消和 Speech 错误映射编写先行 adapter contract test（`tests/contract/speech-stream.contract.test.ts`；来源：US-001、FR-001、AC-001、Speech adapter Contract；依赖：T005）
- [x] T013 [US1] 为 start/二进制帧/stop 协议、started 前禁传音频、背压失败、draining 排空和停止边界编写先行 WebSocket 集成测试（`tests/contract/websocket-session.contract.test.ts`；来源：US-001、FR-001、AC-001、design 数据流与 WebSocket Contract；依赖：T007、T011、T012）
- [x] T014 [US1] 使用合成 WAV 编写 Playwright 功能测试，验证用户手动开始、浏览器音频逐帧上传、发言结束前进入字幕流程及停止后不再采集（`tests/e2e/audio-stream.spec.ts`；来源：IQA-001、IQA-003、AC-001、Constitution 四；依赖：T010、T013）

### 实现

- [x] T015 [US1] 实现用户触发的麦克风申请、AudioWorklet 16 kHz mono PCM 转换、按序帧发送，以及 stop、失败、断连和卸载时停止 MediaStreamTrack（`src/client/audio-worklet.ts`、`src/client/audio-capture.ts`；来源：US-001、FR-001、AC-001、TD-002；依赖：T014）
- [x] T016 [US1] 实现可注入 Speech adapter contract、PushAudioInputStream 会话状态机、start/stop/draining 边界及仅 finalized segment 的单调编号（`src/server/adapters/speech.ts`、`src/server/translation-session.ts`；来源：US-001、FR-001、AC-001、TD-004、design 生命周期；依赖：T011、T012、T013）
- [x] T017 [US1] 实现同源 WebSocket 客户端与服务端路由，将音频采集生命周期连接到每连接一个 Session，并提供仅测试进程可用的确定性 adapter 使 T014 可执行通过（`src/client/translation-client.ts`、`src/server/websocket.ts`、`src/server/adapters/deterministic.ts`；来源：US-001、FR-001、AC-001、TD-002、TD-007；依赖：T015、T016）

## Phase 4：US2 - 自动识别 V1 源语言

### 测试

- [x] T018 [US2] 为 `en-US`/`zh-CN` continuous language identification、仅接受主标签 `en`、完整 `aad#<resourceId>#<token>` 初始赋值与按到期时间刷新、畸形 resource ID 失败编写先行 contract test（`tests/contract/azure-speech.contract.test.ts`；来源：US-002、FR-002、FR-003、AC-002、TD-003、design Speech adapter Contract；依赖：T012、T016）
- [x] T019 [US2] 编写 Playwright 功能测试，验证页面无源语言选择、英语被自动检测、非英语不进入翻译且目标语言固定为中文（`tests/e2e/language-detection.spec.ts`；来源：IQA-002、FR-002、FR-003、AC-002；依赖：T010、T017、T018）

### 实现

- [x] T020 [US2] 实现 Workload Identity Speech adapter：原样使用 HTTPS endpoint 和完整 ARM resource ID、配置 continuous identification、更新 SpeechConfig 与活动 recognizer 的完整授权令牌，并拒绝非英语 finalized result（`src/server/adapters/azure-speech.ts`；来源：US-002、FR-002、FR-003、AC-002、TD-003、design 安全与 Secret；依赖：T018、T019）
- [x] T021 [US2] 将真实 Speech adapter 接入会话并发出不含原文的 `speech.final` 与真实 `speechResultId` evidence，保持 deterministic evidence 的明确前缀（`src/server/translation-session.ts`、`src/server/websocket.ts`；来源：AC-002、design dependency.evidence Contract、TD-007；依赖：T020）

## Phase 5：US3 - 持续阅读中文字幕

### 测试

- [x] T022 [P] [US3] 为 Foundry project endpoint、环境指定 deployment、流式输出、固定简体中文 instruction、`reasoning_effort: none`、取消、错误映射和非空 request ID 编写先行 contract test（`tests/contract/foundry.contract.test.ts`；来源：US-003、FR-004、AC-004、TD-005、Foundry adapter Contract；依赖：T007）
- [x] T023 [P] [US3] 为每会话 FIFO、segmentId/revision 单调性、前片段完成后再提交后片段、增量合并及完成片段不可覆盖编写先行单元测试（`tests/unit/translation-queue.test.ts`、`tests/unit/subtitle-reducer.test.ts`；来源：US-003、FR-004、FR-005、NFR-001、TD-004；依赖：T005）
- [x] T024 [US3] 使用合成 WAV 编写 Playwright 完整功能流，断言后续片段播放期间较早中文字幕已可见、字幕按输入顺序表达概念词组且同一 segment 具备依赖关联 evidence（`tests/e2e/streaming-subtitles.spec.ts`；来源：IQA-001、IQA-003、AC-003、AC-004、Constitution 四；依赖：T010、T019、T022、T023）
- [x] T025 [US3] 编写 Playwright 反向判定，确保仅页面可访问、仅原文、结束后批量输出、非中文、乱序、语义不对应或 test-double 冒充真实 evidence 均不能被测试判为完整验收通过（`tests/e2e/rejection-cases.spec.ts`；来源：spec 开发者验证、IQA-003、AC-003、AC-004；依赖：T024）

### 实现

- [x] T026 [US3] 实现 Foundry Workload Identity 流式翻译 adapter，固定中文和关闭 reasoning，传播取消并只输出脱敏 request ID（`src/server/adapters/foundry.ts`；来源：US-003、FR-004、AC-004、TD-005；依赖：T022、T025）
- [x] T027 [US3] 实现 finalized 英语片段的单消费者 FIFO 翻译队列、delta/final 事件、draining 等待边界和 Speech/Foundry evidence 一一关联（`src/server/translation-queue.ts`、`src/server/translation-session.ts`；来源：FR-004、FR-005、NFR-001、AC-003、AC-004、TD-004；依赖：T023、T026）
- [x] T028 [US3] 实现字幕 reducer、按 segmentId 顺序的增量中文可见列表和开始/停止界面，不展示原文或语言选择（`src/client/subtitle-reducer.ts`、`src/client/App.tsx`、`src/client/styles.css`；来源：US-003、FR-004、FR-005、AC-002～AC-004；依赖：T023、T027）
- [x] T029 [US3] 完成浏览器入口和端到端组装，使确定性本地流程通过 T024、T025 且真实配置使用 Azure adapters（`src/client/main.tsx`、`src/client/index.html`、`src/server/app.ts`；来源：SC-001～SC-004、TD-001、TD-007；依赖：T021、T027、T028）

## Phase 6：Polish

### 测试

- [x] T030 为 stop、disconnect、dependency failure、SIGTERM 的音轨、Speech stream/recognizer、模型流和 WebSocket 释放，以及失败后手动新建会话编写定向测试（`tests/unit/resource-cleanup.test.ts`、`tests/contract/shutdown.contract.test.ts`；来源：design 生命周期、支持 Runbook、TD-006；依赖：T029）
- [x] T031 为 `/healthz`、`/candidate-identity` 原样响应、缺配置启动失败及数字非 root 容器契约编写静态/contract 验证（`tests/contract/candidate-runtime.contract.test.ts`；来源：design HTTP 契约、平台部署约束、Quickstart 3；依赖：T029）

### 实现

- [x] T032 实现 SIGTERM 拒绝新连接并按失败路径清理全部活动会话，补齐 stop、断连和依赖失败的幂等资源释放，使 T030 通过（`src/server/index.ts`、`src/server/websocket.ts`、`src/server/translation-session.ts`、`src/client/audio-capture.ts`；来源：design 数据流与生命周期、安全与 Secret；依赖：T030）
- [x] T033 编写可由 `bash -n` 校验的开发者功能测试脚本，显式启动 deterministic test 进程并以锁定依赖执行 Playwright（`.ai-delivery/features/002-v1/runtime/developer-functional-run.sh`；来源：TD-007、design 部署拓扑、验证环境责任矩阵；依赖：T024、T025、T029）
- [x] T034 声明 clean runner 安装和 staticAnalysis→build→developerTests→integrationTests→functionalTests 命令、端口 3000、health/identity 路径、无 PostgreSQL 且不需要私网（`.ai-delivery/features/002-v1/runtime/deployment.json`；来源：design 平台验证约束、部署拓扑；依赖：T001、T033）
- [x] T035 构建 Node.js 22 多阶段单容器镜像，仅安装生产依赖与构建产物，以数字 UID 10001 运行端口 3000，且不包含源码测试输出或本地环境文件（`Dockerfile`；来源：TD-008、design 部署拓扑、平台画像；依赖：T003、T029、T031、T034）
- [x] T036 按 deployment contract 在 clean 本地环境依次执行安装、Chromium 安装、typecheck、build、unit、contract、developer functional 和 Docker 构建检查，并保存命令退出码作为 Coding 完成证据（`.ai-delivery/features/002-v1/runtime/deployment.json`；来源：design Quickstart 1～3、验证环境责任矩阵；依赖：T031、T032、T033、T034、T035）

## 完成证据

- Coding 证据包括：锁文件 clean install 成功；typecheck 与生产 build 退出码为 0；单元测试证明状态、顺序及清理不变量；contract test 证明协议、Azure adapter 参数、令牌刷新、配置、脱敏、HTTP 与候选运行契约；本地 Playwright 使用合成 WAV 证明应用编排中的流式可见性、英语自动检测、中文字幕顺序和明确失败判定；Docker 构建证明数字非 root 单容器可生成。
- 本地 deterministic adapter、Mock、health、candidate identity 和镜像构建均不构成 IQA-001～IQA-003 的真实功能通过证据。
- 不在 Coding 中产生的延后平台证据包括：不可变候选提交重跑、ACR 镜像摘要、AKS 部署与 Workload Identity 注入、真实 Speech/Foundry 调用、Independent QA 的 IQA-001～IQA-003 结果、UAT、发布审批、评审和合并结果。
