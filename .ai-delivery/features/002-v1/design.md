# 实时流式翻译技术方案

## 技术上下文（Technical Context）

V1 是单容器 Web App：浏览器采集英语会议语音，服务端使用 Azure AI Speech 连续识别并自动检测英语，再使用 Azure AI Foundry 模型把已确认的转写片段流式翻译成中文，浏览器按原始片段顺序逐步显示字幕。实现采用 Node.js 22 LTS、TypeScript、React、Vite 与 Fastify，部署到平台提供的 AKS；不使用数据库、消息总线、对象存储或会话持久化。

平台在候选环境以 Workload Identity 提供 Azure 身份，并注入 Speech endpoint、Foundry project endpoint 与模型 deployment 名称。Coding 沙箱无 Azure 凭据，只能产生确定性的本地证据；真实服务和部署证据由候选验证及 Independent QA 产生。当前批准范围没有数值化延迟、容量、可用率或准确率目标，因此设计仅保证可观察的流式顺序与生命周期，不虚构数值承诺。

实现就绪状态：`true`。已批准产品范围、技术基线与平台能力足以完成实现，没有需要 Coding 决定的技术项，也没有未解决的业务或产品问题。

## 治理与技术约束

- Constitution 的范围受控与简单架构原则：仅实现英语到中文的浏览器实时字幕；采用单个无状态 Web/BFF 容器，不增加账户、会后记录、数据库、队列或其他会议能力。
- Constitution 的数据安全原则：音频、转写与字幕只在当前进程内短暂处理，不持久化、不写日志；Azure 访问只使用 Workload Identity，不使用服务密钥或连接字符串。
- Constitution 的验证原则：Playwright 覆盖完整浏览器流程；本地 Mock 测试只提供开发反馈，最终验收必须由 Independent QA 在真实 AKS、Speech 与 Foundry 环境完成，health check 或页面加载不能替代。
- 已批准技术基线：使用 Node.js 22 LTS、TypeScript、React、Vite、Fastify、Azure AI Speech continuous recognition/continuous language identification，以及 Foundry 模型流式翻译并关闭 reasoning。由于候选平台只向 Pod 提供 Workload Identity，最终选择“服务端统一处理 STT 与翻译”，避免向浏览器转交 Azure 身份令牌。
- 平台部署约束：根目录 Dockerfile、数字非 root UID、单一容器端口、`runAsNonRoot`、只读式无状态运行、公开 HTTP 入口以及公网出站。应用监听 `0.0.0.0:3000`，提供 `/healthz` 和 `/candidate-identity`。
- 平台验证约束：`.ai-delivery/features/002-v1/runtime/deployment.json` 按静态分析、构建、开发者测试、集成测试、功能测试分类声明命令；`requiresPrivateNetwork` 为 `false`，不声明 PostgreSQL。
- Specification 的质量边界：不引入任意延迟、重试次数、并发量、准确率或保留期；“实时/连续”只按较早字幕在后续语音仍播放时已可见来判定。

## 架构概览（Architecture）

1. React 页面经 `getUserMedia` 获得麦克风流，`AudioWorklet` 转换为 16 kHz、单声道、16-bit little-endian PCM；用户开始采集后建立同源 WebSocket。
2. Fastify WebSocket 会话接收控制消息和二进制 PCM 帧，把音频写入 Speech SDK `PushAudioInputStream`。Speech adapter 使用 `DefaultAzureCredential` 获取 `https://cognitiveservices.azure.com/.default` 令牌，并对配置的英语候选执行 continuous language identification。
3. Speech 的 finalized recognition result 被赋予单调递增 `segmentId`。仅检测为英语且含非空文本的片段进入单会话 FIFO 翻译队列；interim result 不进入翻译，避免重复字幕。
4. Foundry adapter 使用同一个 `DefaultAzureCredential` 与 project endpoint 获取 OpenAI client，调用平台注入的 deployment，固定目标语言为简体中文，启用流式输出并将 reasoning effort 设为 `none`。
5. 服务端按 `segmentId` 串行消费翻译流，经 WebSocket 发出增量与完成事件。浏览器只在前一片段完成后提交后一片段到可见字幕列表，从协议和 UI 两层保证顺序。
6. Fastify 同时托管 Vite 构建后的静态文件、健康与候选身份端点。所有会话状态仅存在于对应 WebSocket 生命周期内。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | Node.js 22 LTS、TypeScript、React、Vite、Fastify 单仓单容器 | 与批准基线一致，最少组件即可同时提供 UI、WebSocket 和平台端点 | 多服务拆分会增加当前范围不需要的部署与一致性成本 | 技术基线；Constitution 二 |
| TD-002 | 浏览器以 WebSocket 上传 PCM，服务端统一调用 Speech 和 Foundry | AKS Workload Identity 不暴露给浏览器；服务端可统一控制顺序、取消与令牌刷新 | 浏览器直连 Speech 需要把短期 Azure token 暴露给客户端，且平台未提供安全签发所需的长期凭据 | FR-001～FR-005；平台画像 |
| TD-003 | Speech continuous recognition + continuous language identification；内部候选为 `en-US` 与 `zh-CN`，只接受检测语言主标签 `en` | 自动检测必须有可区分候选；`zh-CN` 仅作检测对照，不形成额外受支持语言，所有非 `en` 结果停止进入翻译 | 单一英语候选不构成实质自动检测；扩大到更多语言会超出 V1 | FR-002、FR-003、AC-002 |
| TD-004 | finalized Speech segment 串行进入每会话 FIFO Foundry 翻译队列 | 避免 interim 修订造成重复，并确定性保持发言顺序 | 并行翻译吞吐更高但可能乱序；整段结束后翻译违反流式要求 | FR-004、FR-005、NFR-001 |
| TD-005 | Foundry 流式 Chat Completions，deployment 来自环境，`reasoning_effort: none`，固定中文翻译 system instruction | 满足持续翻译、指定模型部署与关闭 reasoning 的基线 | 非流式 completion 不满足连续性；静默替换模型违反基线 | INT-007、FR-004；技术基线 |
| TD-006 | 内存会话状态且不持久化任何会议内容 | 满足最简单架构和数据最小化，范围不含会后记录 | PostgreSQL、Blob 或消息总线均无批准需求 | Constitution 二、三；spec 范围外 |
| TD-007 | 本地可替换 adapter 做单元、contract 与 Playwright 功能测试；真实服务只在下游环境验收 | Coding 无云凭据，同时保留可重复反馈与真实验收边界 | 在 Coding 伪造真实服务证据不可接受 | Constitution 四；IQA-001～003 |
| TD-008 | 单个 AKS Pod、LoadBalancer Service、不可变镜像 | 与平台真实候选环境一致，当前无持久状态或多副本要求 | Container Apps 是基线早期候选，但本交付平台实际部署目标为 AKS | 平台画像 |

## 领域与数据模型

- `Session`：`sessionId`（随机、只用于进程内关联）、`state`、`nextSegmentId`、`lastCompletedSegmentId`、Speech recognizer、翻译队列和取消信号。不得包含用户身份或持久化引用。
- `AudioFrame`：二进制 PCM，格式固定为 16 kHz / mono / signed 16-bit little-endian；仅在活动会话中写入 Speech stream。
- `RecognitionSegment`：`segmentId`、`detectedLanguage`、`text`、`isFinal=true`。`text` 只在内存传给翻译 adapter，不进入日志。
- `SubtitleSegment`：`segmentId`、`revision`、`text`、`isFinal`。同一片段 revision 单调递增；页面按 `segmentId` 排序并用增量更新当前片段。
- `SessionState`：`idle → starting → listening → draining → stopped`；任意活动状态可转为 `failed`，随后释放资源并终止该次会话。重新执行必须新建会话，不续接旧内容。
- 不变量：只有本会话 finalized 英语转写可产生字幕；目标语言恒为中文；`segmentId` 严格递增；完成片段不可被后续片段覆盖或重排；停止后不得接受音频或产生新字幕。

## Component 边界与项目结构

Coding 获准创建或修改的仓库根路径如下：

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `playwright.config.ts`
- `./Dockerfile`
- `./.dockerignore`
- `./.gitignore`
- `src/`
- `tests/`

`src/client/` 包含 React 页面、AudioWorklet、WebSocket client、字幕 reducer 与样式；`src/server/` 包含 Fastify 启动、健康/身份路由、WebSocket session、Speech/Foundry adapters 与配置校验；`src/shared/` 包含协议 schema 和共享类型。`tests/unit/` 验证状态机与排序，`tests/contract/` 验证 adapters 和协议，`tests/e2e/` 放置本地 Playwright 场景，`tests/fixtures/audio/` 保存可重复的合成 PCM/WAV 素材及对应语义清单。

构建输出 `dist/`、测试输出 `test-results/`、Playwright 报告 `playwright-report/`、coverage 与 `node_modules/` 必须写入 `.gitignore`；Docker build context 通过 `.dockerignore` 排除这些输出、Git 元数据和本地环境文件。Feature 下的 `runtime/deployment.json` 与 `runtime/qa-run.sh` 是 Hub 规定的交付运行制品，不属于上述代码根路径；其内容必须严格按本设计的部署与验证契约生成。

## 数据流、状态、并发与生命周期

用户触发开始后，客户端先获麦克风许可，再连接 `/ws/translation` 并发送 `start`。服务端完成 Azure 凭据、Speech recognizer 与 push stream 初始化后返回 `session.started`，客户端此后才发送音频。音频帧保持采集顺序写入单一 Speech stream；背压超过 WebSocket 可写能力时终止当前会话，不丢帧后继续伪装连续结果。

每个 WebSocket 只拥有一个 Session 和一个 Speech recognizer。Speech finalized callback 只负责分配 `segmentId` 并入队，单消费者依序调用 Foundry；当前片段翻译完成前不启动下一片段翻译。模型 delta 依次映射为 `subtitle.delta`，最终结果映射为 `subtitle.final`。页面保留本次会话已完成字幕直到页面刷新或下一次手动开始，但不上传或持久化。

用户停止时，客户端停止音轨和 AudioWorklet，发送 `stop`；服务端关闭音频输入，等待 Speech 已接收内容及已入队翻译排空后发 `session.stopped`，随即释放 recognizer、队列与 credential client 引用。浏览器断开、Azure 调用失败、协议错误或 Pod 终止时立即取消尚未完成的流，释放资源且不补发内容。进程处理 `SIGTERM` 时停止接受新连接并关闭现有会话；由于只有一个平台副本且无持久状态，发布切换不会迁移活动会话。

## Interface 与契约（Contract）

HTTP 契约：

- `GET /healthz`：进程已启动且配置已通过结构校验时返回 `200 application/json` 与 `{"status":"ok"}`；不调用 Azure，不泄露配置。未就绪返回 `503`。
- `GET /candidate-identity`：返回 `200 application/json` 与 `{"deliveryId":"<AIDELIVERY_DELIVERY_ID>","candidateSha":"<AIDELIVERY_CANDIDATE_SHA>"}`；缺少任一变量时服务启动失败。
- `GET /*`：提供构建后的 SPA；API 与 WebSocket 路径不回退到 HTML。

WebSocket `GET /ws/translation` 使用 JSON control/event 与 binary audio frame。客户端消息：

- `{"type":"start","protocolVersion":1,"audio":{"encoding":"pcm_s16le","sampleRate":16000,"channels":1}}`
- 二进制音频帧，仅允许在 `session.started` 后发送。
- `{"type":"stop"}`，每会话最多一次。

服务端事件：

- `session.started`：`protocolVersion`、`sessionId`。
- `speech.final`：`segmentId`、`detectedLanguage`；不向 UI 暴露原文正文，事件仅供状态与自动检测证据。
- `subtitle.delta`：`segmentId`、`revision`、`textDelta`、`targetLanguage:"zh-CN"`。
- `subtitle.final`：`segmentId`、`revision`、`text`、`targetLanguage:"zh-CN"`。
- `session.stopped`：无待处理片段。
- `session.failed`：仅含稳定错误码 `INVALID_AUDIO`、`UNSUPPORTED_LANGUAGE`、`SPEECH_UNAVAILABLE`、`MODEL_UNAVAILABLE`、`PROTOCOL_ERROR` 或 `INTERNAL_ERROR`；不包含会议正文、Azure 原始响应或凭据。Specification 未批准错误文案，因此 UI 只结束当前采集，不把具体呈现样式纳入验收。

所有 JSON 以 TypeBox schema 在边界验证；未知字段拒绝，未知消息类型触发 `PROTOCOL_ERROR`。协议版本为整数 `1`；不兼容版本拒绝连接。V1 不承诺跨版本兼容，后续破坏性变更必须提升 `protocolVersion`。Speech adapter contract 接收 PCM push stream并产生按序 finalized segment；Foundry adapter contract 接收单个 finalized 英语片段并产生中文 delta/final。contract test 用记录式 fake 验证请求参数、reasoning 关闭、取消传播、错误映射与不记录正文；真实 adapter 由 Independent QA 验证。

## 安全、隐私、身份与 Secret

服务端使用 `DefaultAzureCredential`；AKS 中解析为 Workload Identity，Speech 与 Foundry 分别请求其官方 scope。禁止 API key、连接字符串、浏览器 token、`.env` secret 和测试凭据。客户端只能访问同源应用，WebSocket 校验 `Origin` 与当前 Host；CSP 至少限制 `default-src 'self'`、`connect-src 'self'`、`media-src 'self' blob:`，并禁止 frame 嵌入与对象资源。

麦克风仅在用户启动后申请，停止、失败、断连和页面卸载均停止所有 MediaStreamTrack。服务端不持久化音频、转写或字幕；结构化日志对消息正文、音频、authorization header、token 和 Azure response body 一律禁记。容器以数字 UID `10001` 运行，不提权，不依赖可写应用目录；临时运行数据只保存在内存。

## 配置、可观测性与运维

必需环境变量为 `PORT`（镜像默认 `3000`）、`AIDELIVERY_DELIVERY_ID`、`AIDELIVERY_CANDIDATE_SHA`、`AZURE_CLIENT_ID`、`AZURE_SPEECH_ENDPOINT`、`AZURE_AI_PROJECT_ENDPOINT`（兼容读取平台同时提供的 `FOUNDRY_PROJECT_ENDPOINT`，两者同时存在且不一致则启动失败）及 `AZURE_AI_MODEL_DEPLOYMENT_NAME`；该 deployment 必须由环境指向已批准的 gpt-sol-6.1，不允许应用静默改用其他模型。目标语言、协议版本、音频格式、语言检测候选和 reasoning 关闭均为代码内受测不变量，不允许环境变量扩大产品范围。仅测试进程允许显式 `APP_ADAPTER_MODE=deterministic`；生产构建或非 `NODE_ENV=test` 收到该值必须拒绝启动，防止 fake adapter 进入候选部署。

stdout 输出 JSON 日志：时间、level、event、sessionId 哈希、segmentId、状态、依赖名、调用结果分类和错误码；不输出正文、音频、token、endpoint query 或完整 Azure 异常。核心事件包括启动配置结果、会话状态转换、Speech/Foundry 调用开始与结束、取消、资源释放和健康状态。平台未提供 telemetry backend 或告警系统，设计不新增外部观测产品；候选日志仅用于故障关联。

## SLO、限制、扩缩容、重试与恢复

产品 SLO 仅为 NFR-001 的可观察条件：后续语义片段仍在播放时，较早片段字幕已经可见。没有批准的毫秒延迟、吞吐、可用率或准确率数字。候选部署固定 1 个副本，请求/限制为平台给定的 100m/256Mi 与 1 CPU/1Gi；不自行定义扩缩容阈值或容量承诺。

每个浏览器连接只允许一个活动会话和一个串行翻译队列。依赖调用不在服务端自动重试，避免重复字幕和顺序不确定；Azure SDK 自带的认证令牌获取/刷新不视为业务重试。Speech 或 Foundry 中断即取消本会话，用户在前置条件恢复后可手动重新开始完整流程。内存压力、背压或队列异常均 fail closed，不丢弃中间内容后继续。恢复不续接旧音频或字幕。

## 部署拓扑、迁移、Rollout 与 Rollback

多阶段根目录 Dockerfile 在 Node.js 22 镜像中执行锁文件安装、类型检查和构建，runtime stage 仅安装生产依赖、复制 server 与静态资源，以 `USER 10001` 启动 `node` 进程并暴露 `3000`。镜像不得包含源码测试输出、凭据或本地环境文件。

`runtime/deployment.json` 声明 `containerPort: 3000`、`healthPath: "/healthz"`、`candidateIdentityPath: "/candidate-identity"`、`requiresPrivateNetwork: false`，不声明 `postgresql`。`developerSetupCommands` 固定为 `npm ci --ignore-scripts`；`developerValidationCommands` 固定分类为：`staticAnalysis` 执行 `npm run typecheck`，`build` 执行 `npm run build`，`developerTests` 执行 `npm run test:unit`，`integrationTests` 执行 `npm run test:contract`，`functionalTests` 执行 `bash tests/scripts/developer-functional.sh`。该脚本启动显式 deterministic adapter 的测试进程并执行 `npm run test:e2e`，同时须通过 `bash -n`。

平台以不可变 candidate SHA 构建镜像并部署到交付命名空间，LoadBalancer 80 转发容器 3000。应用无 schema 和持久化迁移，故无 migration command。Rollout 以 `/healthz` 与 `/candidate-identity` 通过为最低部署条件；真实功能通过 Independent QA 判定。失败时把 Service/Deployment 恢复到上一已知通过的不可变镜像；活动会话会终止，用户需手动重新开始，不执行数据回滚。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 格式、类型、构建、单元测试 | Coding 与 Candidate checks | Copilot 沙箱及 `ubuntu-latest` clean runner | Node.js 22、锁文件；无 Azure 凭据 | 命令退出码、状态机/排序/脱敏测试报告 | Candidate checks 在不可变提交重跑并给出结果 |
| adapter 与协议 contract | Coding 与 Candidate checks | 本地进程、记录式 fake adapter | 无真实服务、无凭据 | Speech/Foundry 参数、协议 schema、错误/取消映射测试 | CI 对不可变提交重跑；不构成真实集成证据 |
| 本地 Playwright 功能流 | Coding 与 Candidate checks | Chromium、合成 WAV、进程内确定性 adapter | Playwright；无 Azure 凭据 | 较早字幕在后续音频期间可见、顺序及失败判定记录 | CI 重跑；仅证明应用编排，不构成 IQA 通过 |
| 镜像与候选身份 | 候选验证 Delivery validation | ACR、AKS、LoadBalancer | 平台 OIDC/Workload Identity 与注入变量 | Dockerfile、health/identity contract test | 镜像构建、非 root、部署、health 与 candidate identity 结果 |
| IQA-001～IQA-003 真实完整流程 | Independent QA | 候选 AKS 公网地址、真实 Azure Speech/Foundry | QA OIDC、Azure CLI、Speech/Foundry 环境变量、合成英语音频 | `qa-run.sh` 与 Playwright 黑盒断言、结果 JSON schema 测试 | 发言期间字幕进展、自动检测英语、中文语义/顺序与实际依赖关联证据 |
| 发布回归 | release verification | 已批准候选镜像和目标运行环境 | 目标环境 Workload Identity | 已通过候选与 Independent QA 的不可变 SHA | 发布后 health/identity 及必要完整流程结果；不替代前述 IQA |

Independent QA 的 `runtime/qa-run.sh` 在空临时目录使用 Azure CLI/OIDC 合成或取得含多个明确语义片段的英语 WAV，以 Chromium fake audio capture 注入麦克风，调用 `QA_BASE_URL` 完成 Playwright 黑盒流程，并把唯一输出写到 `QA_RESULT_PATH`。由于候选入口按平台约束是 HTTP 公网 IP，QA Chromium 必须仅对该精确 `QA_BASE_URL` 使用 `--unsafely-treat-insecure-origin-as-secure` 以启用测试麦克风；此开关只属于候选测试，不进入应用或生产配置，正式用户入口仍须由部署环境提供浏览器认可的 HTTPS。结果严格包含平台规定字段、IQA-001～003 三个 scenario、真实服务名称与非敏感证据；不修改仓库工作区。

## 快速验证指南（Quickstart）

1. 使用 Node.js 22，在仓库根目录执行 deployment contract 中的 `npm ci --ignore-scripts`。
2. 依次执行静态分析、生产构建、单元、contract 与本地 Playwright 命令；任何非零结果均停止。本地 Playwright 使用 `tests/fixtures/audio/` 的多语义片段合成英语素材和确定性 adapter，断言发言尚未结束时已有较早字幕、字幕顺序不变且目标为中文。
3. 以根目录 Dockerfile 构建镜像，检查最终 `USER` 解析为正整数 `10001`，启动容器并验证 `/healthz`；提供测试用 delivery/candidate 环境变量后验证 `/candidate-identity` 原样返回。
4. 候选验证部署不可变镜像后，只把 health 与 identity 作为部署证据，不宣称功能验收。
5. Independent QA 使用真实 Speech、Foundry 和候选 URL 执行 IQA-001～003；确认输入音频播放进度、发言期间字幕快照、自动检测事件、中文字幕顺序/语义和实际依赖调用可关联，且结果文件无 defect 或 test gap 时方可通过。

## 支持 Runbook

- 启动失败：检查必需环境变量是否存在、两个 Foundry endpoint 是否冲突、端口是否可绑定；不得打印变量值或 token。
- health 失败：核对进程、静态资源构建产物和配置校验日志。`/healthz` 不探测 Azure，因此 Azure 故障不应伪装成 Pod 未存活。
- candidate identity 失败：核对平台注入的 delivery ID/candidate SHA 与部署镜像是否一致；不得使用构建时硬编码值。
- 无 Speech 结果：按 sessionId 哈希关联 `speech.call` 状态，检查 Workload Identity role、endpoint 公网可达性、PCM 格式和检测结果；禁止在日志中加入音频或转写正文。
- 有转写无字幕：检查 Foundry deployment 环境变量、Workload Identity role、stream 结束原因及 FIFO 状态；不得切换未批准模型或回退到批量伪结果。
- 字幕乱序或只在结束后出现：检查 segmentId/revision、不变量、串行队列和客户端 reducer；使用合成多片段语音复现，不能以最终全文正确视为通过。
- 资源未释放：确认 stop、disconnect、failure、SIGTERM 均关闭 MediaStreamTrack、PushAudioInputStream、recognizer、模型 stream 与 WebSocket。
- Azure 依赖恢复后：用户手动新建完整会话；不续接或补发旧会话。候选缺陷通过新不可变镜像重跑全部必要验证；生产回退到上一已知通过镜像。

## 开放决策

无。
