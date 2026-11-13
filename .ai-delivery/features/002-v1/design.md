# 实时流式翻译技术方案

## 技术上下文（Technical Context）

V1 是单容器 Web App：浏览器采集英语会议语音，服务端使用 Azure AI Speech 连续识别并自动检测英语，再使用 Azure AI Foundry 模型把已确认的转写片段流式翻译成中文，浏览器按原始片段顺序逐步显示字幕。实现采用 Node.js 22 LTS、TypeScript、React、Vite 与 Fastify，部署到平台提供的 AKS；不使用数据库、消息总线、对象存储或会话持久化。

人工审批已确认 `rg-ai-delivery-hub-dev` 中现有 Azure AI Foundry 能力可供本交付使用；候选环境以 Workload Identity 提供 Azure 身份，并注入 Speech endpoint、Speech 完整 ARM resource ID、Foundry project endpoint 与模型 deployment 名称。Coding 沙箱无 Azure 凭据，只能产生确定性的本地证据；真实服务和部署证据由候选验证及 Independent QA 产生。当前批准范围没有数值化延迟、容量、可用率或准确率目标，因此设计仅保证可观察的流式顺序与生命周期，不虚构数值承诺。

实现就绪状态：`true`。已批准产品范围、技术基线、人工确认的 Azure 资源可用性及平台注入契约足以完成 Coding，没有需要 Coding 决定的技术项，也没有未解决的业务或产品问题。

## 治理与技术约束

- Constitution 的范围受控与简单架构原则：仅实现英语到中文的浏览器实时字幕；采用单个无状态 Web/BFF 容器，不增加账户、会后记录、数据库、队列或其他会议能力。
- Constitution 的数据安全原则：音频、转写与字幕只在当前进程内短暂处理，不持久化、不写日志；Azure 访问只使用 Workload Identity，不使用服务密钥或连接字符串。
- Constitution 的验证原则：Playwright 覆盖完整浏览器流程；本地 Mock 测试只提供开发反馈，最终验收必须由 Independent QA 在真实 AKS、Speech 与 Foundry 环境完成，health check 或页面加载不能替代。
- 已批准技术基线：使用 Node.js 22 LTS、TypeScript、React、Vite、Fastify、Azure AI Speech continuous recognition/continuous language identification，以及 Foundry 模型流式翻译并关闭 reasoning。最终选择候选 B“服务端统一处理 STT 与翻译”：候选 A 的 BFF token 端点原本依赖可下发给浏览器且仅限 Speech 的短期 service token；当前平台只给 Pod 提供 Workload Identity，没有 Speech key 或 token-broker 能力。把 Workload Identity 取得的 Entra bearer token 发给浏览器会把 Pod 的资源级 `Cognitive Services Speech User` 权限转移到不受信任客户端，且该 token 不能约束到单个浏览器会话，违反已批准的凭据不进入浏览器边界。因此候选 A 在当前 WI-only 输入下不能按其批准的安全契约实施；候选 B 可让 bearer token 始终留在 Pod，并由服务端 Speech SDK 执行同一连续识别能力，不需要以尚未发生的真实浏览器测试证明一个缺失 token 签发输入的问题。
- 平台部署约束：根目录 Dockerfile、数字非 root UID、单一容器端口、`runAsNonRoot`、只读式无状态运行、公开 HTTP 入口以及公网出站。应用监听 `0.0.0.0:3000`，提供 `/healthz` 和 `/candidate-identity`。
- 平台验证约束：`.ai-delivery/features/002-v1/runtime/deployment.json` 按静态分析、构建、开发者测试、集成测试、功能测试分类声明命令；`requiresPrivateNetwork` 为 `false`，不声明 PostgreSQL。
- Specification 的质量边界：不引入任意延迟、重试次数、并发量、准确率或保留期；“实时/连续”只按较早字幕在后续语音仍播放时已可见来判定。

## 架构概览（Architecture）

1. React 页面经 `getUserMedia` 获得麦克风流，`AudioWorklet` 转换为 16 kHz、单声道、16-bit little-endian PCM；用户开始采集后建立同源 WebSocket。
2. Fastify WebSocket 会话接收控制消息和二进制 PCM 帧，把音频写入 Microsoft Cognitive Services Speech SDK for JavaScript 的 `PushAudioInputStream`。Speech adapter 以 `DefaultAzureCredential({managedIdentityClientId: AZURE_CLIENT_ID})` 获取 `https://cognitiveservices.azure.com/.default` 的 Entra access token；以完整 `AZURE_SPEECH_ENDPOINT` 构造 `SpeechConfig.fromEndpoint(new URL(endpoint))`，并把平台注入的 Speech ARM 资源 ID 与 access token 严格构造为 Azure AI Speech SDK 要求的 `aad#<resourceId>#<accessToken>`，再赋给 `SpeechConfig.authorizationToken` 后创建 recognizer。资源 ID 必须来自 `AZURE_SPEECH_RESOURCE_ID`，格式为 `/subscriptions/<subscriptionId>/resourceGroups/<resourceGroup>/providers/Microsoft.CognitiveServices/accounts/<accountName>`；endpoint 必须是 SDK 接受的 Speech resource endpoint，应用不得从 endpoint host 猜测或推导资源 ID、region 或其他 endpoint。recognizer 对配置的英语候选执行 continuous language identification。
3. Speech 的 finalized recognition result 被赋予单调递增 `segmentId`。仅检测为英语且含非空文本的片段进入单会话 FIFO 翻译队列；interim result 不进入翻译，避免重复字幕。
4. Foundry adapter 使用同一个 `DefaultAzureCredential` 与 project endpoint 获取 OpenAI client，调用平台注入的 deployment，固定目标语言为简体中文，启用流式输出并将 reasoning effort 设为 `none`。
5. 服务端按 `segmentId` 串行消费翻译流，经 WebSocket 发出增量与完成事件。浏览器只在前一片段完成后提交后一片段到可见字幕列表，从协议和 UI 两层保证顺序。
6. Fastify 同时托管 Vite 构建后的静态文件、健康与候选身份端点。所有会话状态仅存在于对应 WebSocket 生命周期内。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | Node.js 22 LTS、TypeScript、React、Vite、Fastify 单仓单容器 | 与批准基线一致，最少组件即可同时提供 UI、WebSocket 和平台端点 | 多服务拆分会增加当前范围不需要的部署与一致性成本 | 技术基线；Constitution 二 |
| TD-002 | 浏览器以 WebSocket 上传 PCM，服务端统一调用 Speech 和 Foundry | 当前 WI-only 平台不提供候选 A 所需的 Speech key/service-token broker；Entra bearer token 具有 Pod 的资源级角色且不能缩限到浏览器会话，不得转交浏览器。服务端按官方 SDK 契约用平台注入的 Speech ARM 资源 ID 和 bearer token 构造 `aad#<resourceId>#<accessToken>`，且该值始终留在 Pod | 候选 A 只在存在可安全签发的 Speech service token 时可实施；当前输入不满足。直接实现 Speech WebSocket protocol 会绕开批准的 SDK 约束 | FR-001～FR-005；技术基线；平台画像 |
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
- 不变量：只有本会话在 `listening` 期间已被服务端接收的音频所形成的 finalized 英语转写可产生字幕；目标语言恒为中文；`segmentId` 严格递增；完成片段不可被后续片段覆盖或重排。收到 `stop` 即进入 `draining` 并拒绝后续音频，但允许已接收音频产生 `speech.final`、`subtitle.delta` 和 `subtitle.final`；发出 `session.stopped` 后不得再产生任何 Speech 或字幕事件。

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

`src/client/` 包含 React 页面、AudioWorklet、WebSocket client、字幕 reducer 与样式；`src/server/` 包含 Fastify 启动、健康/身份路由、WebSocket session、Speech/Foundry adapters 与配置校验；`src/shared/` 包含协议 schema 和共享类型。`tests/unit/` 验证状态机与排序，`tests/contract/` 验证 adapters 和协议，`tests/e2e/` 放置本地 Playwright 场景，`tests/fixtures/audio/iqa-en-multisegment.wav` 保存可重复的合成英语音频，`tests/fixtures/audio/iqa-en-multisegment.json` 保存片段时间、英文原意及可自动判定的中文概念词组。

构建输出 `dist/`、测试输出 `test-results/`、Playwright 报告 `playwright-report/`、coverage 与 `node_modules/` 必须写入 `.gitignore`；Docker build context 通过 `.dockerignore` 排除这些输出、Git 元数据和本地环境文件。所需音频和语义清单固定来自 `tests/fixtures/audio/`。

## 数据流、状态、并发与生命周期

用户触发开始后，客户端先获麦克风许可，再连接 `/ws/translation` 并发送 `start`。服务端完成 Azure 凭据、Speech recognizer 与 push stream 初始化后返回 `session.started`，客户端此后才发送音频。音频帧保持采集顺序写入单一 Speech stream；背压超过 WebSocket 可写能力时终止当前会话，不丢帧后继续伪装连续结果。

每个 WebSocket 只拥有一个 Session 和一个 Speech recognizer。Speech finalized callback 只负责分配 `segmentId` 并入队，单消费者依序调用 Foundry；当前片段翻译完成前不启动下一片段翻译。模型 delta 依次映射为 `subtitle.delta`，最终结果映射为 `subtitle.final`。页面保留本次会话已完成字幕直到页面刷新或下一次手动开始，但不上传或持久化。

用户停止时，客户端先停止音轨和 AudioWorklet，再发送 `stop`。服务端原子地记录最后一个已接收音频帧序号、从 `listening` 进入 `draining`、拒绝并忽略此后所有二进制帧，然后关闭 `PushAudioInputStream`。`draining` 期间 recognizer 仅可为截止帧之前的音频发出 `speech.final`，这些片段及 stop 前已经入队/进行中的翻译继续产生 `subtitle.delta/final`；recognizer 的 session-stopped 回调到达后冻结最后 `segmentId`，等待 FIFO 到该 ID 全部 final，才发出唯一的 `session.stopped` 并进入 `stopped`。`session.stopped` 是结果边界，之后任何晚到 callback 都必须丢弃。若 drain 期间出现 Azure 错误、断连或 Pod 终止，则不排空，直接取消并发 `session.failed`（连接已断时仅记录无正文状态），且永不补发。进程处理 `SIGTERM` 时停止接受新连接并按失败路径取消现有会话；单副本且无持久状态，不迁移活动会话。

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
- `dependency.evidence`：`segmentId`、Speech SDK 返回的非空 `speechResultId`、Foundry 响应 header 的非空 `modelRequestId`；只能由真实 adapter 从 Azure SDK 响应元数据生成，不包含正文、token 或 endpoint。确定性 adapter 使用明确的 `test-double:` 前缀，生产配置拒绝该前缀。
- `session.stopped`：表示 stop 截止音频对应的 Speech callback 已结束且所有已接受片段均已产生 final；这是最后一个业务事件。
- `session.failed`：仅含稳定错误码 `INVALID_AUDIO`、`UNSUPPORTED_LANGUAGE`、`SPEECH_UNAVAILABLE`、`MODEL_UNAVAILABLE`、`PROTOCOL_ERROR` 或 `INTERNAL_ERROR`；不包含会议正文、Azure 原始响应或凭据。Specification 未批准错误文案，因此 UI 只结束当前采集，不把具体呈现样式纳入验收。

所有 JSON 以 TypeBox schema 在边界验证；未知字段拒绝，未知消息类型触发 `PROTOCOL_ERROR`。协议版本为整数 `1`；不兼容版本拒绝连接。V1 不承诺跨版本兼容，后续破坏性变更必须提升 `protocolVersion`。Speech adapter contract 接收 PCM push stream并产生按序 finalized segment；Foundry adapter contract 接收单个 finalized 英语片段并产生中文 delta/final。contract test 用记录式 fake 验证 Speech 初次配置和活动 recognizer 续期都精确使用 `aad#<resourceId>#<accessToken>`、缺失或畸形 resource ID 时启动失败、请求参数、reasoning 关闭、取消传播、错误映射与不记录正文，并精确断言 stop 后音频拒绝、draining 可输出截止前结果、`session.stopped` 后零业务事件。真实 adapter 由 Independent QA 验证。

## 安全、隐私、身份与 Secret

服务端使用带 `AZURE_CLIENT_ID` 的 `DefaultAzureCredential`；AKS 中解析为 Workload Identity。Speech 令牌 scope 固定为 `https://cognitiveservices.azure.com/.default`，初次创建 recognizer 前取得令牌，并以已校验的 `AZURE_SPEECH_RESOURCE_ID` 构造 `aad#${resourceId}#${accessToken}` 后同时设置 `SpeechConfig.authorizationToken` 与新建 recognizer 的 `authorizationToken`。每次取得令牌后在 `expiresOnTimestamp` 前 5 分钟刷新，若本次剩余有效期不足 10 分钟则在剩余有效期中点刷新；刷新成功时使用同一个已校验资源 ID 和新 access token 重新构造完整 authorization token，同时更新保存的 `SpeechConfig.authorizationToken` 与所有活动 `SpeechRecognizer.authorizationToken`，保证长会话不沿用旧的完整 token。禁止保存或赋值原始 bearer token，禁止在续期时省略 `aad#` 前缀或资源 ID。若到期前刷新失败，则终止会话为 `SPEECH_UNAVAILABLE`，不改用 key。Foundry 使用 Azure Identity client 的内建令牌刷新。禁止 API key、连接字符串、浏览器 token、`.env` secret 和测试凭据。客户端只能访问同源应用，WebSocket 校验 `Origin` 与当前 Host；CSP 至少限制 `default-src 'self'`、`connect-src 'self'`、`media-src 'self' blob:`，并禁止 frame 嵌入与对象资源。

麦克风仅在用户启动后申请，停止、失败、断连和页面卸载均停止所有 MediaStreamTrack。服务端不持久化音频、转写或字幕；结构化日志对消息正文、音频、authorization header、token 和 Azure response body 一律禁记。容器以数字 UID `10001` 运行，不提权，不依赖可写应用目录；临时运行数据只保存在内存。

## 配置、可观测性与运维

必需环境变量为 `PORT`（镜像默认 `3000`）、`AIDELIVERY_DELIVERY_ID`、`AIDELIVERY_CANDIDATE_SHA`、`AZURE_CLIENT_ID`、`AZURE_SPEECH_ENDPOINT`、`AZURE_SPEECH_RESOURCE_ID`、`AZURE_AI_PROJECT_ENDPOINT`（兼容读取平台同时提供的 `FOUNDRY_PROJECT_ENDPOINT`，两者同时存在且不一致则启动失败）及 `AZURE_AI_MODEL_DEPLOYMENT_NAME`；QA 环境变量 `AZURE_AI_MODEL_DEPLOYMENT` 只供 QA 记录环境，不进入应用。Speech endpoint 必须是绝对 HTTPS URL，SDK 原样使用；Speech resource ID 必须是平台从已配置 Speech 资源元数据取得并原样注入的完整 ARM ID，应用启动时按 `/subscriptions/<非空>/resourceGroups/<非空>/providers/Microsoft.CognitiveServices/accounts/<非空>` 结构（resource provider 大小写不敏感）校验，缺失或不合法即启动失败，绝不从 endpoint、DNS 或 account name 推导。该 deployment 必须由环境指向已批准的 gpt-sol-6.1，不允许应用静默改用其他模型。目标语言、协议版本、音频格式、语言检测候选和 reasoning 关闭均为代码内受测不变量，不允许环境变量扩大产品范围。仅测试进程允许显式 `APP_ADAPTER_MODE=deterministic`；生产构建或非 `NODE_ENV=test` 收到该值必须拒绝启动，防止 fake adapter 进入候选部署。

stdout 输出 JSON 日志：时间、level、event、sessionId 哈希、segmentId、状态、依赖名、调用结果分类和错误码；不输出正文、音频、token、endpoint query 或完整 Azure 异常。核心事件包括启动配置结果、会话状态转换、Speech/Foundry 调用开始与结束、取消、资源释放和健康状态。平台未提供 telemetry backend 或告警系统，设计不新增外部观测产品；候选日志仅用于故障关联。

## SLO、限制、扩缩容、重试与恢复

产品 SLO 仅为 NFR-001 的可观察条件：后续语义片段仍在播放时，较早片段字幕已经可见。没有批准的毫秒延迟、吞吐、可用率或准确率数字。候选部署固定 1 个副本，请求/限制为平台给定的 100m/256Mi 与 1 CPU/1Gi；不自行定义扩缩容阈值或容量承诺。

每个浏览器连接只允许一个活动会话和一个串行翻译队列。依赖调用不在服务端自动重试，避免重复字幕和顺序不确定；Azure SDK 自带的认证令牌获取/刷新不视为业务重试。Speech 或 Foundry 中断即取消本会话，用户在前置条件恢复后可手动重新开始完整流程。内存压力、背压或队列异常均 fail closed，不丢弃中间内容后继续。恢复不续接旧音频或字幕。

## 部署拓扑、迁移、Rollout 与 Rollback

多阶段根目录 Dockerfile 在 Node.js 22 镜像中执行锁文件安装、类型检查和构建，runtime stage 仅安装生产依赖、复制 server 与静态资源，以 `USER 10001` 启动 `node` 进程并暴露 `3000`。镜像不得包含源码测试输出、凭据或本地环境文件。

`runtime/deployment.json` 声明 `containerPort: 3000`、`healthPath: "/healthz"`、`candidateIdentityPath: "/candidate-identity"`、`requiresPrivateNetwork: false`，不声明 `postgresql`。候选部署平台把已配置 Speech 资源的完整 ARM resource ID 连同 `AZURE_SPEECH_ENDPOINT` 一起以 `AZURE_SPEECH_RESOURCE_ID` 注入 Pod；这两个值必须指向人工确认可用的同一资源。该值不是 secret，但不得由应用从 endpoint host 猜测；缺失或不一致时应用必须在启动阶段失败，而不是以原始 bearer token 尝试 Speech 连接。根 `package.json` 必须把 `@playwright/test` 固定为 devDependency 且锁入 `package-lock.json`。`developerSetupCommands` 依次为 `npm ci --ignore-scripts` 与 `npx playwright install --with-deps chromium`，因此 clean `ubuntu-latest` 不依赖预存 browser cache 或系统 Chromium；`developerValidationCommands` 固定分类为：`staticAnalysis` 执行 `npm run typecheck`，`build` 执行 `npm run build`，`developerTests` 执行 `npm run test:unit`，`integrationTests` 执行 `npm run test:contract`，`functionalTests` 执行 `bash tests/scripts/developer-functional.sh`。该脚本启动显式 deterministic adapter 的测试进程并通过锁定依赖的 `npx --no-install playwright test` 执行 `npm run test:e2e`，同时须通过 `bash -n`。

平台以不可变 candidate SHA 构建镜像并部署到交付命名空间，LoadBalancer 80 转发容器 3000。应用无 schema 和持久化迁移，故无 migration command。Rollout 以 `/healthz` 与 `/candidate-identity` 通过为最低部署条件；真实功能通过 Independent QA 判定。失败时把 Service/Deployment 恢复到上一已知通过的不可变镜像；活动会话会终止，用户需手动重新开始，不执行数据回滚。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 格式、类型、构建、单元测试 | Coding 与 Candidate checks | Copilot 沙箱及 `ubuntu-latest` clean runner | Node.js 22、锁文件；无 Azure 凭据 | 命令退出码、状态机/排序/脱敏测试报告 | Candidate checks 在不可变提交重跑并给出结果 |
| adapter 与协议 contract | Coding 与 Candidate checks | 本地进程、记录式 fake adapter | 无真实服务、无凭据 | Speech/Foundry 参数、协议 schema、错误/取消映射测试 | CI 对不可变提交重跑；不构成真实集成证据 |
| 本地 Playwright 功能流 | Coding 与 Candidate checks | Chromium、合成 WAV、进程内确定性 adapter | Playwright；无 Azure 凭据 | 较早字幕在后续音频期间可见、顺序及失败判定记录 | CI 重跑；仅证明应用编排，不构成 IQA 通过 |
| 镜像与候选身份 | 候选验证 Delivery validation | ACR、AKS、LoadBalancer | 平台 OIDC/Workload Identity，以及含 `AZURE_SPEECH_RESOURCE_ID` 的注入变量 | Dockerfile、health/identity contract test；配置 contract 验证缺少/畸形 resource ID 时启动失败 | 镜像构建、非 root、部署、health、candidate identity 与 Speech ARM ID 注入结果 |
| IQA-001～IQA-003 真实完整流程 | Independent QA | 候选 AKS 公网地址、真实 Azure Speech/Foundry | 平台预装锁定 npm 依赖及 Chromium、QA OIDC、Speech/Foundry 环境变量、内嵌且与仓库 fixture 同 hash 的合成英语音频 | `qa-run.sh`、Playwright 黑盒断言、fixture/内嵌数据一致性 contract test、结果 JSON schema test | 发言期间字幕进展、自动检测英语、中文概念词组顺序及同一 segment 的 Azure Speech result ID/Foundry request ID |
| 发布回归 | release verification | 已批准候选镜像和目标运行环境 | 目标环境 Workload Identity | 已通过候选与 Independent QA 的不可变 SHA | 发布后 health/identity 及必要完整流程结果；不替代前述 IQA |

Independent QA 的 `runtime/qa-run.sh` 不调用 TTS，也不依赖仓库 checkout 路径。Coding 将 `tests/fixtures/audio/iqa-en-multisegment.wav` 的 PCM payload 和 `iqa-en-multisegment.json` 的语义清单以 base64 常量及 SHA-256 同步嵌入脚本；contract test 必须证明脚本常量解码 hash 与仓库 fixture/manifest 完全一致。脚本在空临时目录中以 Node.js 内存解码，将 PCM 通过 Playwright init script 的 Web Audio `MediaStreamDestination` 作为 `getUserMedia` 测试输入，不落盘；唯一写入是 `QA_RESULT_PATH`。平台在执行脚本前已从根 `package-lock.json` 运行 `npm ci --ignore-scripts` 并安装 Chromium到 `PLAYWRIGHT_BROWSERS_PATH`；脚本先用 `node -e "require.resolve('@playwright/test')"` 和 Playwright `chromium.executablePath()` 验证运行时，缺失即记录 test gap 并失败，不联网安装、不依赖 cache。

音频按顺序表达 “The red lamp is on.” 和 “The train arrives at seven.”，manifest 记录第二片段开始播放时刻及两个有序中文概念组：第一组必须同时出现“红”和“灯”，第二组必须出现“火车”或“列车”以及“七”或“7”。IQA-001 在第二片段播放尚未结束时轮询可见字幕并要求第一组已出现，最终要求两组在合并字幕中的首次位置严格递增；IQA-002 要求页面不存在语言选择交互、收到 `detectedLanguage` 主标签 `en` 且所有 final 字幕含至少一个汉字；IQA-003 要求同一次 session 的每个通过语义检查的 segment 都收到非 `test-double:` 的 `speechResultId` 与 `modelRequestId`，并与字幕 `segmentId` 一一对应。二者分别直接取自 Speech SDK recognition result metadata 与 Foundry HTTP response header，不接受应用仅自报服务名称、Mock 标志、页面加载或 health 作为依赖证据。Playwright trace、带音频播放时间/字幕快照/ID 的内存事件摘要和最终断言写入结果 JSON 的 evidence 字符串；不写正文以外的服务响应，不含 token。

由于候选入口按平台约束是 HTTP 公网 IP，QA Chromium 必须仅对该精确 `QA_BASE_URL` 使用 `--unsafely-treat-insecure-origin-as-secure` 以启用测试麦克风；此开关只属于候选测试，不进入应用或生产配置，正式用户入口仍须由部署环境提供浏览器认可的 HTTPS。结果严格包含平台规定字段、IQA-001～003 三个 scenario、`externalServices` 固定为 `["Azure AI Speech","Azure AI Foundry"]`、上述非敏感关联证据及 bugfixResults；`passed=true` 时全部 scenario 通过且 defects/testGaps 为空，否则至少填一个 defect 或 test gap。脚本校验 `QA_CANDIDATE_SHA`、`QA_BASE_URL`、`QA_PLAN_COMMIT_SHA`、`QA_PLAN_HASH` 并原样写入契约字段，不修改工作区或临时目录中的其他文件。

## 快速验证指南（Quickstart）

1. 使用 Node.js 22，在仓库根目录依次执行 deployment contract 中的 `npm ci --ignore-scripts` 和 `npx playwright install --with-deps chromium`，不得依赖已存在的 browser cache。
2. 依次执行静态分析、生产构建、单元、contract 与本地 Playwright 命令；任何非零结果均停止。本地 Playwright 使用 `tests/fixtures/audio/` 的多语义片段合成英语素材和确定性 adapter，断言发言尚未结束时已有较早字幕、字幕顺序不变且目标为中文。
3. 以根目录 Dockerfile 构建镜像，检查最终 `USER` 解析为正整数 `10001`，启动容器并验证 `/healthz`；提供测试用 delivery/candidate 环境变量后验证 `/candidate-identity` 原样返回。
4. 候选验证部署不可变镜像后，只把 health 与 identity 作为部署证据，不宣称功能验收。
5. Independent QA 使用仓库 fixture 的内嵌同 hash 音频、真实 Speech、Foundry 和候选 URL 执行 IQA-001～003；确认第二片段结束前第一概念组已可见、两个中文概念组有序、自动检测主标签为 `en`，且同一 segment 有非测试替身的 Speech result ID 与 Foundry request ID。结果文件无 defect 或 test gap 时方可通过。

## 支持 Runbook

- 启动失败：检查必需环境变量是否存在、两个 Foundry endpoint 是否冲突、端口是否可绑定；不得打印变量值或 token。
- health 失败：核对进程、静态资源构建产物和配置校验日志。`/healthz` 不探测 Azure，因此 Azure 故障不应伪装成 Pod 未存活。
- candidate identity 失败：核对平台注入的 delivery ID/candidate SHA 与部署镜像是否一致；不得使用构建时硬编码值。
- 无 Speech 结果：按 sessionId 哈希关联 `speech.call` 状态，检查 Workload Identity role、`AZURE_SPEECH_ENDPOINT` 与 `AZURE_SPEECH_RESOURCE_ID` 是否由平台取自同一 Speech 资源、endpoint 公网可达性、PCM 格式和检测结果；禁止从 host 猜测资源 ID，也禁止在日志中加入资源 ID、音频或转写正文。
- Speech 会话约十分钟后失败：检查 `expiresOnTimestamp` 驱动的 refresh 事件，以及配置和活动 recognizer 是否都更新为由同一资源 ID 与新 access token 构造的完整 `aad#<resourceId>#<accessToken>`；不得改为原始 bearer token，也不得通过延长、记录或向浏览器下发 token 绕过。
- 有转写无字幕：检查 Foundry deployment 环境变量、Workload Identity role、stream 结束原因及 FIFO 状态；不得切换未批准模型或回退到批量伪结果。
- 字幕乱序或只在结束后出现：检查 segmentId/revision、不变量、串行队列和客户端 reducer；使用合成多片段语音复现，不能以最终全文正确视为通过。
- 资源未释放：确认 stop、disconnect、failure、SIGTERM 均关闭 MediaStreamTrack、PushAudioInputStream、recognizer、模型 stream 与 WebSocket。
- Azure 依赖恢复后：用户手动新建完整会话；不续接或补发旧会话。候选缺陷通过新不可变镜像重跑全部必要验证；生产回退到上一已知通过镜像。

## 开放决策

无。
