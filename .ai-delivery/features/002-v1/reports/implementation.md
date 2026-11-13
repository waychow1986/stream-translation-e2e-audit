# Coding 实施报告

## Coding Session NR-DLV-20261113-96F0EE0F92F9-0032-b01

### 实施范围

本次以 `coding` 模式按依赖顺序完成 T001～T036。范围包括 Node.js 22 单容器 Web App、浏览器 PCM 音频采集、同源 WebSocket、Azure Speech continuous recognition/continuous language identification、Azure AI Foundry 流式中文翻译、顺序字幕、Workload Identity、确定性本地测试、候选 runtime 契约及容器交付制品。

### 完成与受阻任务

完成 T001～T036，共 36 项；没有受阻任务，也没有需要新增输入或人工决定的事项。任务账本中本次 36 项均由 `[ ]` 更新为 `[x]`。

### 变更文件

| 路径 | 变更 | 来源任务 |
|---|---|---|
| `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`playwright.config.ts` | 锁定生产与测试依赖，定义构建、静态检查、单元、contract 与 Playwright 命令 | T001～T002 |
| `.gitignore`、`.dockerignore` | 隔离依赖、构建、测试、Git 与本地环境文件 | T003 |
| `src/shared/` | 新增严格协议 schema、事件与领域类型 | T005 |
| `src/server/` | 新增配置、安全、HTTP/WebSocket、Speech/Foundry adapters、会话状态机、FIFO 翻译及资源释放 | T007、T009、T016～T017、T020～T021、T026～T027、T029、T032 |
| `src/client/` | 新增 AudioWorklet、麦克风生命周期、WebSocket client、字幕 reducer 与 React 界面 | T015、T017、T028～T029 |
| `tests/unit/`、`tests/contract/`、`tests/e2e/` | 新增状态、顺序、协议、Azure 参数、安全、运行契约、资源释放与 Playwright 功能测试 | T004、T006、T008、T011～T014、T018～T019、T022～T025、T030～T031 |
| `tests/fixtures/audio/iqa-en-multisegment.wav`、`tests/fixtures/audio/iqa-en-multisegment.json` | 新增 16 kHz 单声道 PCM 合成英语语音及语义清单 | T010 |
| `Dockerfile` | 新增 Node.js 22 多阶段生产镜像，数字 UID 10001、端口 3000 | T035 |
| `.ai-delivery/features/002-v1/runtime/deployment.json`、`.ai-delivery/features/002-v1/runtime/developer-functional-run.sh` | 新增候选验证声明与确定性 Playwright 功能入口 | T033～T034、T036 |
| `.ai-delivery/features/002-v1/tasks-implementation.md` | 仅勾选已完成的 T001～T036 | T001～T036 |
| `.ai-delivery/features/002-v1/reports/implementation.md`、`.ai-delivery/features/002-v1/.state/results/NR-DLV-20261113-96F0EE0F92F9-0032-b01.json` | 记录本 Session 实施证据与结果 | Coding 结果契约 |

### 需求与场景覆盖

| 来源（FR / AC / IQA） | 实现路径 | 测试路径 | 结果 |
|---|---|---|---|
| FR-001 / AC-001 / IQA-001、IQA-003 | `src/client/audio-capture.ts`、`src/server/adapters/azure-speech.ts`、`src/server/translation-session.ts` | `tests/contract/speech-stream.contract.test.ts`、`tests/e2e/audio-stream.spec.ts` | 本地 contract 与确定性 Playwright 通过 |
| FR-002、FR-003 / AC-002 / IQA-002 | `src/server/adapters/azure-speech.ts`、`src/client/App.tsx` | `tests/contract/azure-speech.contract.test.ts`、`tests/e2e/language-detection.spec.ts` | 英语检测、非英语拒绝、无语言选择与中文目标检查通过 |
| FR-004、FR-005、NFR-001 / AC-003、AC-004 / IQA-001、IQA-003 | `src/server/adapters/azure-foundry.ts`、`src/server/translation-queue.ts`、`src/client/subtitle-reducer.ts` | `tests/unit/translation-queue.test.ts`、`tests/e2e/streaming-subtitles.spec.ts`、`tests/e2e/rejection-cases.spec.ts` | 本地流式顺序、语义概念与反向判定通过；真实 Azure 证据延后 |
| 平台 health 与 candidate identity 契约 | `src/server/routes.ts`、`Dockerfile` | `tests/contract/config-http.contract.test.ts`、`tests/contract/candidate-runtime.contract.test.ts` | contract 与容器 smoke 通过 |

### 执行命令与结果

| 命令 | 环境 | 结果 | 证据 |
|---|---|---|---|
| `rm -rf node_modules && npm ci --ignore-scripts` | Copilot 沙箱，Node.js 22 | 通过，退出码 0 | 安装 214 个 package，audit 为 0 个漏洞 |
| `npx playwright install --with-deps chromium` | Copilot 沙箱 | 通过，退出码 0 | Chromium、headless shell 与 FFmpeg 安装完成 |
| `npm run typecheck` | Copilot 沙箱 | 通过，退出码 0 | TypeScript 无诊断 |
| `npm run build` | Copilot 沙箱 | 通过，退出码 0 | Vite 客户端与服务端构建成功 |
| `npm run test:unit` | Copilot 沙箱 | 通过，退出码 0 | 4 个文件、5 项测试通过 |
| `npm run test:contract` | Copilot 沙箱 | 通过，退出码 0 | 9 个文件、15 项测试通过 |
| `DEV_FUNCTIONAL_RESULT_PATH=/tmp/developer-functional-result.json bash .ai-delivery/features/002-v1/runtime/developer-functional-run.sh` | Copilot 沙箱，Chromium，deterministic adapter | 通过，退出码 0 | 5 项 Playwright 测试通过并写出 `passed:true` |
| `docker build -t stream-translation-candidate:local .` | Copilot 沙箱 Docker | 通过，退出码 0 | 生产多阶段镜像构建完成，生产依赖 audit 为 0 个漏洞 |
| `curl /healthz`、`curl /candidate-identity`、`docker exec stream-translation-smoke id -u` | 本地生产容器 | 通过，退出码 0 | 返回 `{"status":"ok"}`、原样 identity，UID 为 `10001` |
| `npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=moderate` | Copilot 沙箱 | 通过，退出码 0 | 生产与完整依赖均为 0 个已知漏洞 |

### Runtime 与下游门禁就绪制品

根 `Dockerfile` 使用 Node.js 22 多阶段构建并以 `USER 10001` 监听 3000。`runtime/deployment.json` 声明 `/healthz`、`/candidate-identity`、clean install、Chromium 安装及五类验证命令，`requiresPrivateNetwork` 为 `false`，不声明 PostgreSQL。候选身份仅从 `AIDELIVERY_DELIVERY_ID` 与 `AIDELIVERY_CANDIDATE_SHA` 返回。开发者功能脚本通过 `bash -n`，启动明确的 test-only deterministic 进程并输出约定 JSON。

### 延后平台证据

Coding 沙箱没有 Azure、AKS 或云凭据，未执行且未声称真实 Azure Speech、Azure AI Foundry、Workload Identity、ACR、AKS 公网部署或 IQA-001～IQA-003。不可变候选重跑、镜像发布、真实依赖完整流程、Independent QA、UAT、发布审批、评审与合并均由对应下游阶段产生。

### 剩余风险

真实 Speech endpoint 与 ARM resource ID 的配对、Speech SDK continuous language identification、长会话令牌刷新、Foundry deployment 对流式输出和 `reasoning_effort: none` 的支持，以及公网 AKS 中的完整语音到字幕行为，只能由候选环境和 Independent QA 验证。本地 deterministic adapter 的通过结果不构成这些真实集成证据。

### 实施结论

本次已完成 T001～T036 及全部 Coding 责任内验证，生产实现、开发者测试、合成素材、Dockerfile 和 runtime 制品均已就绪；结论为 `passed`。真实 Azure 与部署验收按责任矩阵延后，不作为 Coding 阻塞。

## Coding Session NR-DLV-20261113-96F0EE0F92F9-0034-b01

### 实施范围

本次以 `coding-repair` 模式定向修复 CONV-001 与 CONV-002，覆盖既有 T014、T019、T024～T027、T033，不增加产品范围或任务。修复真实 Foundry delta 的即时传播契约，并以已提交合成 WAV、Chromium fake microphone、`getUserMedia` 和 AudioWorklet 重建本地 Playwright 功能证据。

### 完成与受阻任务

CONV-001 与 CONV-002 已完成修复；既有任务均在 Session 起点前已勾选，本次未发生任务 checkbox 变化，因此本次 `completedTaskIds` 为空。没有受阻任务、所需输入或待人工决定事项。

### 变更文件

| 路径 | 变更 | 来源任务 |
|---|---|---|
| `src/shared/types.ts`、`src/server/adapters/foundry.ts`、`src/server/adapters/azure-foundry.ts`、`src/server/translation-session.ts` | 将翻译 contract 改为 delta 到达即回调并立即发送，流结束后再发送 final 与 evidence | T026、T027 / CONV-001 |
| `src/server/adapters/deterministic.ts` | 按 WAV 输入进度生成可区分的两个 finalized 片段，并通过增量回调输出翻译 | T014、T024、T027 / CONV-002 |
| `src/client/audio-capture.ts`、`playwright.config.ts` | 移除 PCM 测试旁路，以可加载的 AudioWorklet asset 处理 Chromium fake microphone 播放的提交 WAV | T014、T019 / CONV-002 |
| `tests/contract/foundry.contract.test.ts`、`tests/contract/websocket-session.contract.test.ts` | 增加模型流尚未结束时前序 delta 已可观察的回归测试 | T026、T027 / CONV-001 |
| `tests/e2e/audio-stream.spec.ts`、`tests/e2e/language-detection.spec.ts`、`tests/e2e/streaming-subtitles.spec.ts`、`tests/e2e/rejection-cases.spec.ts` | 通过真实浏览器音频链路记录帧进度，断言后续输入期间前序字幕可见，并实际注入批量、原文、非中文、乱序和语义不对应输出 | T014、T019、T024、T025 / CONV-002 |
| `.ai-delivery/features/002-v1/runtime/developer-functional-run.sh` | 更新本地功能证据，准确描述 WAV、麦克风、AudioWorklet、渐进字幕与反向场景 | T033 / CONV-002 |
| `.ai-delivery/features/002-v1/reports/implementation.md`、`.ai-delivery/features/002-v1/.state/results/NR-DLV-20261113-96F0EE0F92F9-0034-b01.json` | 追加本 Session 真实证据并提交结果契约 | Coding 结果契约 |

### 需求与场景覆盖

| 来源（FR / AC / IQA） | 实现路径 | 测试路径 | 结果 |
|---|---|---|---|
| FR-004 / AC-003 / CONV-001 | `src/server/adapters/azure-foundry.ts`、`src/server/translation-session.ts` | `tests/contract/foundry.contract.test.ts`、`tests/contract/websocket-session.contract.test.ts` | 模型流未完成时首个 delta 已发送，定向测试通过 |
| FR-001～FR-003 / AC-001～AC-002 / CONV-002 | `src/client/audio-capture.ts`、`src/server/adapters/deterministic.ts` | `tests/e2e/audio-stream.spec.ts`、`tests/e2e/language-detection.spec.ts` | 提交 WAV 经 fake microphone、`getUserMedia`、AudioWorklet 和 WebSocket 逐帧输入，测试通过 |
| FR-004～FR-005 / NFR-001 / AC-003～AC-004 / CONV-002 | `src/server/translation-session.ts`、`src/client/subtitle-reducer.ts` | `tests/e2e/streaming-subtitles.spec.ts`、`tests/e2e/rejection-cases.spec.ts` | 后续输入期间前序字幕可见；应用实际不合格输出的反向场景通过 |

### 执行命令与结果

| 命令 | 环境 | 结果 | 证据 |
|---|---|---|---|
| `npx vitest run --root . tests/contract/foundry.contract.test.ts tests/contract/websocket-session.contract.test.ts`（实现前） | Copilot 沙箱 | 预期失败，退出码 1 | 2 项新增测试分别因缺少 delta callback 和流结束前无 delta 失败 |
| `npm ci --ignore-scripts`、`npx playwright install --with-deps chromium` | Copilot 沙箱，Node.js 22 | 通过，退出码 0 | 安装 214 个锁定 package 与 Chromium 1254 |
| `npm run typecheck && npm run build && npm run test:unit` | Copilot 沙箱 | 通过，退出码 0 | TypeScript 无诊断；AudioWorklet 独立 JS asset、客户端和服务端构建成功；4 文件 5 项单元测试通过 |
| `npm run test:contract` | Copilot 沙箱 | 首次发现 deterministic 时序回归后修复；最终通过，退出码 0 | 最终 9 文件 16 项 contract test 通过 |
| `DEV_FUNCTIONAL_RESULT_PATH=/tmp/developer-functional-result-final.json bash .ai-delivery/features/002-v1/runtime/developer-functional-run.sh` | Copilot 沙箱，Chromium，提交 WAV，deterministic adapter | 通过，退出码 0 | 10 项 Playwright 测试通过并写出 `passed:true` |
| `bash -n .ai-delivery/features/002-v1/runtime/developer-functional-run.sh` | Copilot 沙箱 | 通过，退出码 0 | 功能脚本语法有效 |
| `docker build -t stream-translation-candidate:repair .` | Copilot 沙箱 Docker | 通过，退出码 0 | Node.js 22 多阶段生产镜像构建成功 |
| `curl /healthz`、`curl /candidate-identity`、`docker exec stream-translation-repair-smoke id -u` | 本地生产容器 | 通过，退出码 0 | 返回 `{"status":"ok"}`、原样 identity，UID 为 `10001` |
| `npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=moderate` | Copilot 沙箱 | 通过，退出码 0 | 生产与完整依赖均为 0 个已知漏洞 |
| `git diff --check` 与改动文件敏感模式扫描 | Copilot 沙箱 | 通过，退出码 0 | 无空白错误，未发现凭据或私钥模式 |

### Runtime 与下游门禁就绪制品

根 `Dockerfile` 与 `runtime/deployment.json` 契约保持不变并成功构建。`runtime/developer-functional-run.sh` 继续由声明的 functionalTests 命令执行，现准确记录 Chromium 使用已提交 WAV 驱动 fake microphone，并经过 `getUserMedia`、AudioWorklet、WebSocket、deterministic Speech/Foundry 编排验证输入期间字幕进展和实际反向失败场景。

### 延后平台证据

Coding 沙箱没有 Azure、AKS 或云凭据，本次未执行且未声称真实 Azure Speech、Azure AI Foundry、Workload Identity、不可变 Candidate、AKS 部署或 Independent QA 结果。真实 Foundry stream 的远程增量行为、实际 Speech 自动检测及 IQA-001～IQA-003 仍由候选验证和 Independent QA 产生。

### 剩余风险

本地功能流仍使用明确的 deterministic adapter，只证明应用编排、浏览器音频链路、渐进时序和失败判定。真实 Azure 服务的流式粒度、请求 metadata、Speech/Foundry 配置与公网部署行为只能在下游环境验证；本地结果不构成真实集成通过证据。

### 实施结论

本次已完成 CONV-001 与 CONV-002 的定向修复，新增回归测试先复现失败，随后所有声明的本地静态、构建、单元、contract、Playwright 功能、脚本语法、容器和依赖审计验证通过；结论为 `passed`。
