# V2 实时流式翻译字幕（边说边出）技术方案

## 技术上下文（Technical Context）

本交付是在空白应用根目录中实现单页 Web App 与同进程 BFF。浏览器负责麦克风采集、Azure Speech continuous recognition、英中自动语言检测及字幕状态呈现；BFF 负责以 AKS Workload Identity 获取 Azure 访问令牌、向浏览器签发短期 Speech authorization token、代理 Azure AI Foundry 流式翻译，并提供静态资源、健康检查和候选身份接口。应用不使用 PostgreSQL，不持久化音频、转写或字幕。

实现栈固定为 Node.js 22 LTS、TypeScript 5、React 19、Vite 7、Fastify 5、Microsoft Cognitive Services Speech SDK 1.53、Azure Identity、OpenAI JavaScript SDK 7 和 Playwright。生产镜像为单一 Linux 容器，监听 `0.0.0.0:8080`。浏览器与服务端之间使用 HTTPS 上的 JSON API 和 NDJSON 流；浏览器直接通过 Azure Speech SDK 与 Speech 服务建立音频流，音频不经过 BFF。

实现已具备充分输入：源语言候选固定为 `en-US`、`zh-CN`；英文走流式翻译，中文直显识别原文；草稿可修订，最终结果不可变；`NFR-002` 给出了可执行的时间边界。无需产品或业务补充决定，`implementationReady=true`。

## 治理与技术约束

- Constitution 的范围受控与简单架构要求：只实现 `FR-001`—`FR-011`，采用浏览器直连 Speech、单进程 BFF、单容器、无数据库/队列的最短路径，不加入账户、归档、术语表或额外产品提示。
- Constitution 的数据安全要求：默认不持久化会议内容；音频仅由浏览器发往 Speech；转写只在浏览器内存和单次翻译请求中存在；日志禁止正文、音频、token 和请求体；Azure 访问仅使用 Workload Identity。
- Constitution 的验证要求：Playwright 必须在真实部署和真实 Azure 服务上验证 `IQA-001`—`IQA-006`；本地 mock、单元测试、构建、health check 仅为辅助证据。
- 技术基线选择浏览器直连 STT、服务端代理翻译。基线中的 Container Apps 承载建议被本交付平台的 AKS 固定运行环境替代，但组件边界保持不变；这不改变任何产品行为。
- 已批准规格将语言候选明确收敛为英语和中文，因此本设计使用 `en-US` 与 `zh-CN`，不采用技术基线早期建议中的“全部可自动检测语言”可行性前提。
- 平台要求根目录 `Dockerfile`、非 root 数字 UID、`/healthz`、`/candidate-identity` 和 Feature runtime 制品。上述平台固定路径不属于本节的 Coding 路径授权清单，但实现和部署契约必须与其一致。
- Coding 沙箱没有 Azure 凭据，只产出确定性的静态、构建、单元、contract 和本地功能辅助证据；真实集成和端到端验收由候选 AKS 环境及 Independent QA 负责。

## 架构概览（Architecture）

1. React 客户端加载配置并在用户授权麦克风后创建一个 Speech recognizer，使用 continuous recognition 与 continuous language identification，候选仅为 `en-US`、`zh-CN`。
2. BFF 以 `DefaultAzureCredential` 获取 `https://cognitiveservices.azure.com/.default` token，将其组装为 Speech SDK 要求的 `aad#<AZURE_SPEECH_RESOURCE_ID>#<access token>`，通过同源短期 token 接口返回；浏览器在过期前获取新 token 并原位更新 recognizer 的 authorization token。
3. 客户端以 Speech `recognizing` 事件驱动当前片段。中文结果直接进入同一 draft 行；英文结果经“稳定前缀 + 最新结果”调度器发送给 BFF，BFF 调用 Foundry Responses API 并以 NDJSON 增量返回中文草稿。
4. Speech `recognized` 最终事件关闭当前识别片段。英文取消旧草稿请求并提交完整文本进行最终翻译，翻译完成后原位替换草稿并固定；中文以完整识别原文直接固定。
5. Caption store 只允许尾部当前 draft 被改写。固定后创建下一片段，React 提交后滚动容器到底部。
6. Fastify 同时提供构建后的静态资源、配置/token/翻译接口、存活就绪合一的健康检查和候选身份接口；进程无状态，单副本不需要共享状态。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | 浏览器 Speech SDK 直连 Azure Speech，BFF 仅签发短期 Entra token | 音频路径最短，避免应用转发音频并保护长期身份，满足边说边出 | 服务端 WebSocket 转发音频会增加跳数、敏感数据面与排空复杂度，不选 | INT-003、INT-008、NFR-001、NFR-002 |
| TD-002 | Node.js 22 LTS + TypeScript + React/Vite + Fastify 单容器 | 与批准基线一致，单进程覆盖 UI、代理和平台端点，适合无状态单副本 | 分离前后端服务增加部署组件；纯静态站点无法安全代理 Foundry | 技术基线、平台画像 |
| TD-003 | Speech continuous language identification 候选固定 `en-US`、`zh-CN` | 精确实现已批准的英中候选范围 | 全语言自动检测超出范围；手工语言选择改变产品行为 | FR-002、AC-005 |
| TD-004 | 英文 interim 采用 latest-wins、单片段至多一个在途翻译，400 ms 静默后或距上次提交 2 秒时提交最新稳定内容 | 合并快速抖动同时保证持续发言中有规律地触发草稿；新结果取消旧请求，避免乱序覆盖 | 每个识别事件并发翻译会乱序且浪费配额；等 final 才翻译违反流式要求 | FR-004、FR-005、NFR-001、NFR-002 |
| TD-005 | Speech 文本变化且至少新增一个完整 token/中文字符时视为可翻译稳定内容；若 2 秒内持续变化，则以最新非空结果作为稳定快照 | 不依赖句末或停顿，能在持续发言中形成草稿；仍由后续 interim 修订 | 只按标点/停顿切分会退化为句末输出；固定词数阈值可能延误短语 | INT-005、FR-004、NFR-002 |
| TD-006 | interim 与 final 共用流式 Foundry Responses API；`reasoning.effort=none`、`store=false`，final 具有更高代次并取消 draft | 首 token 可尽早呈现，最终结果不会被过期草稿覆盖 | 非流式 completion 延迟首次可见；客户端直连会暴露服务访问能力 | FR-004—FR-006、技术基线 |
| TD-007 | 客户端 reducer 维护 append-only fixed 列表与唯一 tail draft，以 `segmentId`、`revision`、`requestId` 拒绝过期事件 | 从结构上保证固定字幕不可变和异步响应有序 | 直接修改 DOM 难以证明状态不变量 | FR-005—FR-011 |
| TD-008 | 不使用数据库、缓存、队列或服务器会话；所有字幕状态仅在当前浏览器标签页内存中 | 规格未要求保存或跨会话恢复，最小化会议内容处理面 | PostgreSQL/Redis 增加未批准持久化和外部依赖 | Constitution、FR-001—FR-011 |
| TD-009 | Playwright 本地测试使用协议级 fake adapter，真实验收使用可重复合成音频、真实 Speech/Foundry 和部署 URL | Coding 无云凭据；下游仍能形成完整真实 E2E 证据 | mock 作为最终验收不满足 Constitution；真人语音不可重复 | IQA-001—IQA-006、平台画像 |
| TD-010 | AKS 单副本、`ClusterIP` 后接平台 `LoadBalancer`、容器端口 8080 | 与平台固定拓扑一致；应用无状态且当前未批准容量目标 | Container Apps 是基线建议但不符合本次固定候选环境 | 平台画像 |

## 领域与数据模型

`CaptionSegment`：

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | string | 客户端会话内单调序号，不含会议正文 |
| `language` | `"en-US" \| "zh-CN"` | 来自 Speech 自动检测；其他值不进入字幕状态 |
| `sourceText` | string | 当前识别文本，仅内存保存 |
| `displayText` | string | 英文路径为中文译文，中文路径等于 `sourceText` |
| `status` | `"draft" \| "finalizing" \| "fixed"` | 仅允许规定的单向转换 |
| `revision` | number | 当前片段每次识别变化递增 |
| `requestId` | string \| null | 关联当前有效翻译流，用于拒绝迟到响应 |

`CaptionState` 包含 `fixedSegments: readonly CaptionSegment[]` 和 `current: CaptionSegment | null`。不变量是：`fixedSegments` 中所有项均为 `fixed` 且对象不可更新；`current` 最多一个且只位于显示列表尾部；固定操作将 current 的不可变副本追加后清空 current。

`TranslationRequest` 包含 `segmentId`、`revision`、`mode: "draft" | "final"`、`sourceLanguage: "en-US"`、`text`。服务端仅接受英语；`text` 为 1—4000 UTF-16 code units，JSON body 最大 16 KiB。该上限是防滥用的内部接口约束；Speech 单个片段超限时终止该片段翻译，不拆分出产品未定义的固定字幕。

`TranslationEvent` 为 `delta`、`completed` 或 `error`。客户端只将匹配当前 `segmentId + revision + requestId` 的事件应用于 draft；`completed` 才允许 final 进入 fixed。任何旧代次事件均丢弃。

## Component 边界与项目结构

Coding 可写路径授权清单：

- `src/`
- `tests/`
- `test-assets/`
- `index.html`
- `tsconfig.json`
- `vite.config.ts`
- `playwright.config.ts`

src/client 包含 React 入口、Speech adapter、翻译 stream client、调度器、caption reducer 和固定视窗组件；src/server 包含 Fastify 进程、环境配置、Azure credential/token provider、Foundry adapter、接口 schema、日志脱敏和平台端点；src/shared 包含双方共享的 contract 与运行时校验。tests/unit 验证状态机和调度器，tests/contract 验证 BFF 与 adapter 契约，tests/e2e 提供本地 Playwright 辅助测试，test-assets/audio 保存可重复的合成英中 WAV 及其 UTF-8 文本 manifest。

根目录 Dockerfile、.dockerignore、包管理文件以及 Feature runtime 中的平台制品由平台另行固定授权，故不列入上述清单。Independent QA 的运行脚本由该阶段在候选部署后独立编写，Coding 不得创建、预置或嵌入其内容。Vite/TypeScript 的本地输出为 dist、coverage、test-results、playwright-report；通过现有或平台授权的根 ignore 配置忽略，若该配置不存在则构建和测试命令必须清理这些输出，不得为此越界修改仓库。

## 数据流、状态、并发与生命周期

启动时客户端先获取 `/api/config`，用户触发开始后才请求麦克风权限和 `/api/speech-token`。recognizer 发出 `recognizing` 时，根据自动检测语言更新当前片段：中文同步更新 `displayText`；英文调度器对变更文本创建 revision，满足 400 ms 静默或 2 秒持续更新上限即取消上一 draft fetch，以最新快照开始新流。每个 segment 仅一个有效 request，取消通过 `AbortController` 传播至 BFF，再传播至 Foundry SDK。

英文 NDJSON delta 累积为当前 revision 的 `displayText`，首个非空 delta 即可见；新 revision 先保留上一版可见草稿，收到新流首个 delta 后原位替换，避免字幕闪空。`recognized` final 到达后状态进入 `finalizing`，取消 draft，提交完整文本；final 的 delta 可持续替换 current，但仅在 `completed` 后原子转为 fixed。中文 final 不调用 BFF，直接以完整原文固定。`NoMatch` 不产生片段。

事件顺序以客户端生成的 `segmentId/revision/requestId` 为准，不依赖网络返回顺序。识别 final 后忽略同 segment 的所有 interim；固定后任何事件均无法取得 current 的匹配 ID。下一次非空识别创建新 segment 并追加在底部。

停止动作依次停止麦克风采集、停止 recognizer、取消 token 刷新计时器、取消所有 fetch，并丢弃未完成 current；已固定内存内容保持可见。页面卸载执行相同清理。依赖失败或语言无法确定时终止当前未固定处理并清理资源，不自动重放音频、不补发中断内容、不修改 fixed；规格未批准额外重试或用户提示，因此恢复只能由用户重新触发新会话。

Speech token 在 Azure access token 过期前 5 分钟由 BFF 刷新缓存，浏览器在服务端返回的 `expiresAt` 前 2 分钟重新获取并设置 recognizer token；并发刷新在 BFF 内合并为一个 promise。服务终止时先停止接收新请求，取消在途 Foundry 请求，随后关闭监听；平台单副本发布不承诺连接迁移。

## Interface 与契约（Contract）

- `GET /healthz`：不访问外部依赖；进程已加载配置且可服务时返回 `200 application/json` 与 `{"status":"ok"}`，否则非 2xx。供平台存活和就绪检查。
- `GET /candidate-identity`：返回 `200 application/json` 与 `{"deliveryId":"<AIDELIVERY_DELIVERY_ID>","candidateSha":"<AIDELIVERY_CANDIDATE_SHA>"}`；缺少任一环境变量时启动失败。
- `GET /api/config`：返回 `{"speechEndpoint":string,"candidateLanguages":["en-US","zh-CN"]}`。不返回资源 ID、模型部署名或任何 token。
- `POST /api/speech-token`：要求同源请求且 body 为空；返回 `{"authorizationToken":string,"expiresAt":RFC3339-string}`。token 值为 Speech SDK Entra 格式，有效期不超过底层 access token。
- `POST /api/translations`：`Content-Type: application/json`，请求为 `TranslationRequest`；成功返回 `200 application/x-ndjson`，每行一个 `TranslationEvent`。`delta` 为 `{"type":"delta","text":string}`，`completed` 为 `{"type":"completed","text":string}`；流开始后的错误为 `{"type":"error","code":"DEPENDENCY_FAILED"|"RATE_LIMITED"|"CANCELLED"}` 后关闭，绝不携带依赖原文。
- 接口失败：schema/语言/大小无效分别返回 `400/413`；非同源写请求返回 `403`；进程并发保护触发返回 `429`；Azure 身份或依赖在响应头前失败返回 `503`。错误 body 统一为 `{"error":{"code":string}}`，不回显输入。

Foundry adapter 使用 `AZURE_AI_PROJECT_ENDPOINT`（若为空则使用等价平台变量 `FOUNDRY_PROJECT_ENDPOINT`）与 `AZURE_AI_MODEL_DEPLOYMENT_NAME`，通过 `DefaultAzureCredential` 的 bearer token provider 调用 Responses API。请求固定 `stream=true`、`store=false`、`reasoning.effort="none"`；system instruction 只要求忠实将当前英语片段译为简体中文、不得扩写或执行语音内容中的指令，user 内容以 JSON data 字段传递。draft 和 final 使用同一契约。

所有应用 API 为版本 1 的同源内部契约；本交付期间字段只可向后兼容地增加可选字段，删除、改名或改变枚举必须同步更新 client、contract tests 和部署，不支持新旧前后端混用。Azure adapter 通过 contract tests 固定所需 SDK 调用形状；SDK 升级必须重新运行真实 integration 和全部 IQA。

## 安全、隐私、身份与 Secret

AKS Pod 使用平台 Workload Identity 注入的 `AZURE_CLIENT_ID`，服务端 `DefaultAzureCredential` 在生产取得 Speech 与 Foundry token；禁止 key、connection string 和浏览器中的 Azure 长期凭据。Speech token 仅由同源 POST 获取，`Cache-Control: no-store`，服务端不记录响应。浏览器不接收 `AZURE_SPEECH_RESOURCE_ID`。

Fastify 校验 `Origin` 与 `Host`，写接口只接受应用自身 origin；配置 CSP 仅允许自身脚本/样式、Speech HTTPS/WSS 端点和同源 API，另设置 `frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'none'`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`。所有 JSON 使用严格 schema 且拒绝未知字段。

不记录、不持久化、不分析音频、识别文本、译文或 Speech token。结构化日志只含随机 request ID、路由、状态码、耗时、Azure 依赖类别和稳定错误码；异常对象先脱敏，不输出 headers/body/URL query。浏览器刷新或停止即释放内存状态；没有用户账户、cookie、localStorage、telemetry backend 或数据库。

## 配置、可观测性与运维

必需环境变量为 `PORT=8080`、`AIDELIVERY_DELIVERY_ID`、`AIDELIVERY_CANDIDATE_SHA`、`AZURE_CLIENT_ID`、`AZURE_SPEECH_ENDPOINT`、`AZURE_SPEECH_RESOURCE_ID`、`AZURE_AI_MODEL_DEPLOYMENT_NAME`，以及 `AZURE_AI_PROJECT_ENDPOINT` 或 `FOUNDRY_PROJECT_ENDPOINT` 至少一个。端点必须为无凭据的 HTTPS URL；Speech resource ID 必须为绝对 ARM resource ID；缺失或格式错误时 fail fast。语言候选、API 路径、reasoning 关闭策略不可由部署环境扩展。

日志写 stdout/stderr，JSON 字段固定为 `timestamp`、`level`、`event`、`requestId`、`route`、`statusCode`、`durationMs`、`dependency`、`errorCode`。事件覆盖启动/终止、token 获取结果、Foundry 请求结果、请求取消与 schema 拒绝；不加入外部 telemetry、告警 backend 或未批准阈值。平台以容器状态、`/healthz` 和候选身份响应作为部署运维信号。

`.ai-delivery/features/003-v1/runtime/deployment.json` 声明 `containerPort: 8080`、`healthPath: "/healthz"`、`candidateIdentityPath: "/candidate-identity"`、`requiresPrivateNetwork: false`、不启用 PostgreSQL，并将已有 npm scripts 分类为 static analysis、build、developer tests、integration tests 与 functional tests。开发功能脚本只运行本地确定性 Playwright 辅助流程，不声称产生真实 Azure 验收证据。

## SLO、限制、扩缩容、重试与恢复

唯一产品时限是 `NFR-002`：英文首条草稿自开始说话 6 秒内可见；持续至少 15 秒且无明显停顿时，草稿早于 final 且相邻更新不超过 5 秒；final 后 3 秒内固定完整译文。客户端以 400 ms/2 秒调度预算给 Speech、网络和模型保留余量，但该内部值不是新增产品承诺。

单个翻译 body 上限 16 KiB、文本上限 4000 code units；每个浏览器片段一个有效翻译流。服务端每 Pod 最多 32 个并发 Foundry 流，超限快速返回 `429`，防止 1 GiB 内存限制下失控；这是部署保护值，不是容量承诺。平台当前固定 1 副本，资源请求 100m CPU/256Mi、限制 1 CPU/1Gi；不自行增加 autoscaler。未来扩容因服务无状态可横向复制，但须以真实流连接和 Azure quota 数据决定。

不对 Speech recognizer 或 Foundry 请求执行应用级自动重试，避免重复、乱序和突破最终固定时限。token 获取仅合并同一在途请求；失败即结束启动。客户端取消、超时或依赖错误清除 current 而不改变 fixed，用户手动重新开始后建立全新会话。没有获批可用率、RTO、RPO、容量或告警阈值。

## 部署拓扑、迁移、Rollout 与 Rollback

根目录 Dockerfile 使用多阶段构建：Node.js 22 构建依赖和前端资源，运行阶段仅包含生产依赖与 `dist`，以数字 UID `10001`、只读应用文件和端口 8080 启动。镜像不得包含测试结果、源音频以外的临时文件或凭据。平台在不可变候选 SHA 上构建并推送 ACR，部署至独立 `qa-<deliveryId>` namespace 的单 Pod，由 LoadBalancer 80 转发至 8080；安全上下文使用 `runAsNonRoot`、禁止提权、drop all capabilities 与 RuntimeDefault seccomp。

本交付无数据库和持久化 schema，迁移为“无”。发布前由 Candidate checks 顺序执行锁文件安装、静态分析、构建、developer、integration 和 functional 辅助验证；随后构建镜像并部署。`/healthz` 与 `/candidate-identity` 都通过后候选才可供 Independent QA 使用。

Rollout 使用候选 SHA 对应的不可变镜像。健康或身份检查失败即不进入 QA；功能验收失败时保留证据并停止推广。Rollback 由平台将工作负载镜像恢复到上一已知良好 digest；因无持久化状态无需数据回滚。回滚会终止当前浏览器流，用户需在旧版本重新开始，不承诺恢复中断片段。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| TypeScript、schema、安全静态检查 | Coding / Candidate checks | Copilot 沙箱与 ubuntu-latest clean runner | Node.js 22、锁文件；无 Azure 凭据 | 命令退出码、静态报告 | Candidate checks 在不可变 SHA 重跑后的结果 |
| 构建与容器契约 | Candidate checks / Delivery validation | ubuntu-latest 与平台 Docker/ACR | Docker、根 Dockerfile | 本地生产 build 结果 | 镜像构建、数字非 root UID 与推送结果 |
| reducer、调度、乱序/取消、token 刷新单元测试 | Coding / Candidate checks | Node test runner | fake clock、fake adapters | 确定性测试结果 | Candidate checks 重跑结果 |
| BFF 与 Azure adapter contract test | Coding / Candidate checks | 本地进程 | stub HTTP/SDK，不使用伪造的云成功作为验收 | 请求 schema、NDJSON、错误映射和脱敏测试 | Candidate checks 重跑结果 |
| 本地 Playwright 功能辅助测试 | Coding / Candidate checks | 本地 Web App + fake Speech/translation adapter | Playwright Chromium、提交的合成素材 | draft 修订、final 固定、追加和滚动的辅助记录 | 仅证明 UI/状态机，不替代 IQA |
| 部署健康与候选身份 | 候选验证 | 真实 AKS candidate namespace | ACR、Workload Identity、公开 URL | health/identity contract 测试 | 平台记录真实 URL 上的检查结果 |
| `IQA-001` 英文草稿与修订 | Independent QA | 真实候选 URL、真实 Speech/Foundry | QA OIDC、Azure CLI、Playwright、QA 独立生成的合成英文音频 | Coding 提供可测 UI 与稳定 DOM 状态属性 | QA 记录音频时序、草稿首现及至少一次更新 |
| `IQA-002` 英文最终替换固定 | Independent QA | 同上 | 连续两片段合成英文音频 | 固定状态 DOM contract | QA 记录 final 前后与第二片段期间不变性 |
| `IQA-003` 中文流式直显 | Independent QA | 真实候选 URL、真实 Speech | QA 独立生成的合成中文音频 | 中文路径 contract tests | QA 记录原文逐步更新且未翻译 |
| `IQA-004` 固定视窗追加跟随 | Independent QA | 真实候选 URL、真实 Speech/Foundry | 足够多片段的合成音频 | scroll 与 append 本地辅助测试 | QA 连续记录容量前后 bottom follow 与 fixed 不变 |
| `IQA-005` 英文时限 | Independent QA | 真实候选 URL、真实 Speech/Foundry | 至少 15 秒无明显停顿的合成英文音频、单调时钟 | DOM 暴露 draft/fixed 状态但不伪造时间 | QA 黑盒计算 6 秒、5 秒、3 秒边界并判定 |
| `IQA-006` 中文最终固定 | Independent QA | 真实候选 URL、真实 Speech | 中文及后续片段合成音频 | fixed 不变量测试 | QA 记录 final 后及后续片段期间内容不变 |

Independent QA 自行编写 `.ai-delivery/features/003-v1/runtime/qa-run.sh`，可使用平台提供的 Azure CLI/OIDC 合成音频和 Playwright 操作候选 URL；该脚本不得依赖仓库源码或 Coding 预置脚本内容，只将规定 JSON 写入 `QA_RESULT_PATH`。Coding 的 `test-assets/` 用于本地可重复测试，不要求 QA 复制其中常量或与之做一致性测试。

## 快速验证指南（Quickstart）

1. 在 clean runner 按 `.ai-delivery/features/003-v1/runtime/deployment.json` 的 `developerSetupCommands` 安装锁定依赖，再依次运行其中 static analysis、build、developer tests、integration tests 和 functional tests；全部必须非零即停。
2. 构建根目录 Dockerfile，检查最终镜像 `USER` 解析为正整数非 root UID；以必需环境变量启动容器并映射 8080。
3. 请求 `/healthz`，确认 `200` 与 `{"status":"ok"}`；请求 `/candidate-identity`，确认值逐字匹配注入的 delivery ID 与 candidate SHA。此步骤只验证部署契约。
4. 候选部署后由 Independent QA 对真实 URL 使用 Playwright 和真实 Azure 服务依次执行 `IQA-001`—`IQA-006`。英语素材必须包含至少 15 秒无明显停顿样本，中文素材必须包含 final 后的后续片段，多片段素材必须超过固定视窗。
5. 使用 Playwright 单调时钟记录音频开始、每次可见字幕变化、Speech final 对应 UI 状态及 fixed 时点；逐项判定 `AC-001`—`AC-009`，特别计算 `NFR-002` 的 6 秒、5 秒和 3 秒边界。仅当六个场景全部通过且无 defects/test gaps 时才形成通过结果。

## 支持 Runbook

- **启动失败**：检查必需环境变量格式、Workload Identity 注入及模型部署变量；不得打印 token。配置错误修正后重新部署同一代码的新不可变候选。
- **健康或身份失败**：分别检查进程监听 `0.0.0.0:8080`、配置加载和平台身份环境变量；identity 不匹配视为错误镜像/部署，不绕过检查。
- **Speech token 失败**：按日志 `errorCode` 检查 federated identity、Speech User 角色、resource ID 与 endpoint；不要切换为 key。恢复后用户重新开始会话。
- **Speech 无 interim 或语言错误**：确认候选仅 `en-US/zh-CN`、continuous recognition/identification 已启用、浏览器麦克风权限和 Speech endpoint 可达；若真实环境持续无法在时限内产生 interim，记录输入与时间证据并停止发布，不改为 final-only。
- **Foundry 翻译失败或超时**：检查 AI Project endpoint、deployment、OpenAI User 角色、quota，以及请求确为 stream、reasoning none；不得静默换模型、重试固定片段或显示英文作为中文译文。
- **字幕乱序或 fixed 被改写**：保留 segment/revision/request ID 的脱敏结构日志和 QA 连续证据，立即判定候选失败；检查 reducer 代次守卫和取消传播。
- **实时性不达标**：从 QA 证据拆分 Speech interim、调度等待、Foundry 首 token 和浏览器提交阶段；只优化对应阶段，任何优化不得放宽 `NFR-002` 或等待 final。
- **资源饱和/429**：核对 Pod 资源、有效流数量和 Azure quota；终止多余在途 draft。没有真实容量数据前不调整为新的容量承诺。
- **回滚**：将 AKS workload 恢复至上一已知良好 image digest，复查 health 与 candidate identity；通知当前会话需重新开始。无数据迁移或恢复操作。

## 开放决策

无。
