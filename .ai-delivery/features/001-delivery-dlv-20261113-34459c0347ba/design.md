# 实时流式翻译技术方案

## 实施就绪状态

`implementationReady: true`

设计选择、边界和契约已经闭合。目标 Azure 订阅与区域中的能力、配额和部署标识属于部署及真实环境验证前置条件；若 Speech SDK 无法在单次会话覆盖验收时的完整自动检测语言集合，或 `gpt-sol-6.1` deployment 不支持流式输出并关闭 reasoning，则不得发布候选版本，且不得通过缩减语言范围、替换模型或伪造结果规避。

## 技术上下文（Technical Context）

- 仓库当前只有 AI Delivery 制品和说明文件，没有既有应用代码、依赖清单或部署定义；本方案按绿地 Web App 设计。
- 产品是浏览器会议字幕：用户手动发起后采集麦克风，连续自动检测源语言、转写、翻译成中文并展示；手动停止或任一处理环节无法继续时终止当前处理，之后仅可手动重新发起。
- 采用已批准基线候选 A：Node.js 22 LTS、TypeScript、React、Vite、Fastify、浏览器版 Microsoft Azure Speech SDK、Azure AI Foundry `gpt-sol-6.1`、单一 Linux 容器和 Azure Container Apps。
- 浏览器直接把音频发送给 Azure AI Speech；应用服务不转发音频。服务端只签发短期 Speech token，并代理 finalized recognition segment 到 Azure AI Foundry 的流式翻译。
- 应用无账户体系、数据库、消息总线和持久化存储。音频、转写和字幕只存在于处理所需的进程内存或浏览器页面内存中。
- 依赖目标环境在部署前提供 Speech resource、支持流式输出且可关闭 reasoning 的 `gpt-sol-6.1` deployment、Container Apps、Managed Identity/平台 secret，以及验收时权威的完整自动检测语言集合。
- 没有获批准的延迟、准确率、可用率、并发量、重试次数或保留期限数值；实现和验证不得自行把这些值变为产品门禁。

## 治理与技术约束

- Constitution 的范围受控和简单架构原则决定采用单 SPA、单 BFF、单容器，不增加账户、归档、导出、数据库、队列、Teams 集成或额外云产品。
- Constitution 的数据安全原则决定长期 Speech key 与 Foundry 身份只在服务端，浏览器仅取得短期 Speech token；会议正文和音频不得进入日志、持久层、测试 fixture 或 telemetry。
- Constitution 的有效验证原则决定 Playwright 必须在真实 Azure integration 环境验证完整浏览器流程；unit、contract、build、health check 和页面 smoke 只能提供辅助证据。
- 技术基线决定浏览器直连 Speech、服务端代理 Foundry 翻译、SSE 下行、Azure Container Apps revision 和不可变 Linux image。只有真实浏览器证明该路径无法满足自动语言识别时，才可重新进行受审批的技术基线变更，Coding 不得自行切换候选 B 或 C。
- `FR-002`/`AC-002` 要求单次流程无需预选语言并覆盖验收时服务可自动检测的完整集合。部署前必须把该权威集合配置给 Speech adapter，并用目标 SDK、订阅和区域验证不存在候选数或 API 能力上限；验证失败是服务能力与已批准范围冲突，不是允许抽样或降级的理由。
- `.github/workflows/` 由平台拥有，本实现不创建或修改其中任何文件。生产候选必须提供根目录 `Dockerfile` 和本 Feature 的 `runtime/deployment.json`，并使 image、candidate SHA 与 QA target 指向同一不可变候选。
- 人类可读内容使用简体中文；代码标识符、HTTP/SSE、JSON、环境变量及 Azure 固有名称保留英文。

## 架构概览（Architecture）

系统包含四个运行组件：

1. **React SPA**：呈现未启动、运行中、中断、已停止状态；响应手动发起、停止和重新发起；管理麦克风与 Speech recognizer；按顺序提交 finalized segments；消费翻译 SSE 并展示中文。
2. **Fastify BFF**：同容器提供 SPA 静态文件、短期 Speech token、运行配置和翻译流接口；校验 Origin、输入 schema 与会话标识；以 Managed Identity 调用 Azure AI Foundry。
3. **Azure AI Speech**：接收浏览器音频，执行 continuous recognition 与 continuous language identification，向浏览器返回 interim/finalized recognition events。只有 finalized text 可进入翻译。
4. **Azure AI Foundry `gpt-sol-6.1`**：接收服务端固定翻译指令和单个 finalized segment，经 Responses API 流式返回中文；reasoning 明确关闭。

单个用户流程的数据路径为：

`麦克风 → 浏览器 Speech SDK → Azure AI Speech → finalized segment → BFF → Azure AI Foundry → SSE → React 字幕`

控制路径为：

`React → GET /api/config + POST /api/speech/token → Speech recognizer`，以及
`React → POST /api/translation/stream → BFF → Foundry`。

BFF 不建立跨请求 session store。浏览器拥有会话状态和有序 segment 队列；每个翻译请求独立携带不可识别用户身份的随机 `sessionId`、递增 `segmentSequence` 和检测语言。应用只在内存中处理请求，Container Apps 可水平扩展而不需要粘性会话。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 来源 |
|---|---|---|---|---|
| TD-001 | React + Vite SPA、Fastify BFF、TypeScript、Node.js 22 LTS，npm workspaces 单仓库 | 符合批准基线，前后端共享契约并保持单一部署单元 | 多仓库或前后端独立部署会增加当前范围不需要的交付面 | 技术基线、FR-001～FR-007 |
| TD-002 | 浏览器版 Azure Speech SDK 直接连接 Azure AI Speech | 音频路径最短，应用服务不接触音频，满足浏览器采集和批准基线 | 服务端 WebSocket 转发音频增加处理面、连接状态与扩缩容复杂度 | INT-003、INT-006、技术基线 |
| TD-003 | BFF 用 Speech key 向 Azure STS 换取短期 token；key 由 Container Apps secret reference 注入 | Speech SDK 可在浏览器连接且不泄露长期凭据 | 把 key 放入 bundle 不安全；服务端转发音频不必要 | Constitution 三、技术基线 |
| TD-004 | 仅提交 finalized recognition segment，浏览器逐段串行请求翻译 | 避免 interim 修订造成重复/乱序字幕；串行队列保持源语音顺序 | 翻译 interim text 会产生撤回语义；并行翻译会乱序 | FR-003、NFR-001、AC-003 |
| TD-005 | BFF 通过 Azure AI Foundry OpenAI-compatible Responses API 调用配置的 `gpt-sol-6.1` deployment，`stream: true`、`reasoning.effort: "none"` | 提供持续输出并落实关闭 reasoning 的批准约束 | 非流式调用破坏连续体验；更换模型未经批准 | INT-006、FR-003、技术基线 |
| TD-006 | 浏览器以 `fetch` POST 消费 BFF 的 `text/event-stream` | POST 可携带 segment schema，ReadableStream 可处理 SSE 且支持 AbortSignal | 原生 EventSource 仅 GET；WebSocket 对逐段单向结果过重 | FR-003、FR-005、FR-006 |
| TD-007 | 浏览器有限状态机加 `runGeneration` 隔离生命周期；停止/中断统一 abort 并销毁 recognizer | 可拒绝停止后的晚到事件，明确启停和恢复边界 | 自动重连会违反手动重新发起语义 | FR-004～FR-007 |
| TD-008 | 不持久化音频、转写、字幕或会话；页面内字幕在当前页面内展示，新一轮发起时清空 | 满足会议期间展示且避免引入未批准归档能力 | 数据库或浏览器持久化扩大范围和会议内容暴露面 | 范围外边界、Constitution 三 |
| TD-009 | 单一多阶段 Docker image；Fastify 在生产环境提供构建后的 SPA 和 API；Azure Container Apps revision 部署 | 最少组件并支持不可变发布和 revision 回滚 | 独立静态站点增加部署与跨源配置；App Service 不是已选基线 | 技术基线 |
| TD-010 | Vitest 验证状态机和 adapter contract，Playwright 验证真实完整流程 | 分离快速开发者反馈与 Constitution 强制 E2E 证据 | mock-only 或 smoke test 不能证明用户可见流程 | Constitution 四、测试策略 |

## 领域与数据模型

应用不保存领域实体。以下对象只在一次页面生命周期或请求生命周期内存在：

- **TranslationRun**：`sessionId`（浏览器随机 UUID）、`generation`（本地递增整数）、`state`、`nextSegmentSequence`、`startedAt`。`sessionId` 仅用于关联技术事件，不代表用户或会议身份。
- **RecognitionSegment**：`sessionId`、`segmentSequence`（从 1 严格递增）、`sourceLanguage`（Speech 返回的 BCP 47 tag）、`text`（finalized transcript）。空白 text 不提交。
- **SubtitleSegment**：`sessionId`、`segmentSequence`、`sourceLanguage`、`textZh`、`status`（`streaming | completed`）。同一 sequence 的增量文本只追加到当前字幕，完成后不可再修改。
- **Interruption**：`stage`（`capture | speech | language-detection | translation`）、`code`（稳定内部错误码）、`message`（简体中文用户提示，不含上游正文）、`retryableByRestart`。该对象只描述当前无法继续，不触发自动恢复。
- **RuntimeConfig**：`speechRegion`、`autoDetectLanguages`。完整语言集合由受控部署配置提供，浏览器不缓存为永久产品清单。

不变量：

- 只有当前 `generation` 且状态为 `running` 的 finalized segment 可以入队和生成字幕。
- 每个 `segmentSequence` 最多发起一次当前 generation 的翻译；队列严格按 sequence 串行完成。
- 字幕必须由同一 sequence 的 finalized transcript 产生；不得把 interim、错误文本或停止后的事件显示为翻译字幕。
- 任一必需步骤中断时，状态先原子切换为 `interrupted`，再取消采集、recognizer、队列和在途 fetch；晚到 callback 因 generation/state 不匹配被丢弃。
- 不在停止或中断期间缓冲待补发内容；重新发起创建新 `sessionId` 和 generation，从后续语音重新开始。

## Component 边界与项目结构

机器可读的已批准根路径清单：

- `./package.json`
- `./package-lock.json`
- `./tsconfig.base.json`
- `./.gitignore`
- `./Dockerfile`
- `./.dockerignore`
- `./apps/web/`
- `./apps/server/`
- `./packages/contracts/`
- `./tests/e2e/`
- `./playwright.config.ts`
- `.ai-delivery/features/001-delivery-dlv-20261113-34459c0347ba/runtime/deployment.json`

职责边界：

```text
apps/
├── web/                    # React UI、状态机、Speech adapter、翻译 SSE client
└── server/                 # Fastify、静态文件、token route、Foundry adapter、health
packages/
└── contracts/              # API schema、SSE event 与稳定错误码
tests/
└── e2e/                    # Playwright 真实环境场景与非敏感输入资产
```

`apps/web` 不读取长期 secret，不调用 Foundry，不保存会议内容；`apps/server` 不接收音频，不保存 transcript；`packages/contracts` 不包含运行时凭据或 provider client。`.gitignore` 忽略 `node_modules/`、`dist/`、`coverage/`、`playwright-report/`、`test-results/`、`.env*`（保留无 secret 的 `.env.example` 时显式例外）；`.dockerignore` 排除相同本地产物、Git 元数据和 Delivery 报告，避免把凭据或测试证据带入 image。

## 数据流、状态、并发与生命周期

### 发起

1. UI 在 `idle` 或 `stopped`，或中断条件已由操作者确认消除后接收手动发起。
2. 状态进入内部 `starting`，生成新 `sessionId`/generation，清空上一轮页面字幕，读取 `/api/config` 并申请 `/api/speech/token`。
3. 浏览器请求麦克风权限，以完整 `autoDetectLanguages` 创建 continuous language identification 配置和 recognizer；任何一步失败均进入用户可见 `interrupted`。
4. recognizer 成功启动后状态进入 `running`。interim result 可用于 SDK 内部处理，但不显示为中文字幕、不提交翻译。

### 连续处理

Speech finalized event 被规范化为 `RecognitionSegment` 并进入 FIFO。每次只处理队首：BFF 校验 schema 和 Origin，调用 Foundry；浏览器把 `translation.delta` 追加到当前字幕，收到 `translation.completed` 后才处理下一段。这样不依赖跨实例状态即可保持字幕顺序。Speech token 在当前运行中按 Azure token 有效期提前刷新并更新 recognizer token；刷新失败按 `speech` 中断处理，不进行隐藏重连。

### 停止与中断

手动停止先切换内部 `stopping` 并递增 generation，然后停止麦克风 track、调用 recognizer stop/close、abort 全部 fetch、清空未处理队列，最终进入 `stopped`。停止开始后到达的 callback 全部丢弃。

采集、Speech cancellation、无法取得检测语言、BFF/Foundry 网络或协议错误、上游错误事件均调用同一中断过程；该过程进入 `interrupted` 并执行与停止相同的资源关闭，但保留明确阶段和错误提示。没有自动重试、自动重连或自动补发。用户手动重新发起才创建新生命周期。

页面卸载执行 best-effort 资源关闭；因浏览器关闭而不能确认的网络动作不产生持久状态。多个浏览器页面互不共享状态。服务端无状态，可由 Container Apps 分配任一请求到任一 replica。

## Interface 与契约（Contract）

所有应用接口仅接受 HTTPS，同源路径以 `/api` 开头，JSON 使用 UTF-8。生产环境对状态变更/敏感接口校验 `Origin` 与配置的公开应用 origin 一致；不启用跨源 CORS。

### `GET /api/config`

成功 `200 application/json`：

```json
{
  "speechRegion": "string",
  "autoDetectLanguages": ["BCP-47"]
}
```

`autoDetectLanguages` 必须是部署时确认的非空、去重、完整权威集合；服务启动时校验。该接口不返回 key、endpoint secret 或 Foundry 信息。

### `POST /api/speech/token`

无请求体。BFF 使用服务端 Speech key 调用对应 region 的 Azure STS `issueToken`，成功返回 `200`：

```json
{
  "token": "short-lived-token",
  "region": "string",
  "expiresInSeconds": 540
}
```

`expiresInSeconds` 是客户端刷新提示，不扩大 Azure token 的真实有效期。STS 失败返回标准错误，浏览器进入 `speech` 中断。响应设置 `Cache-Control: no-store`。

### `POST /api/translation/stream`

请求 `application/json`：

```json
{
  "sessionId": "uuid",
  "segmentSequence": 1,
  "sourceLanguage": "BCP-47",
  "text": "finalized transcript"
}
```

BFF 使用固定 system instruction，要求仅把输入翻译为中文、不得添加解释，并把 transcript 作为独立 user content；调用配置的 Azure AI Foundry `/openai/v1/responses`，指定 deployment `gpt-sol-6.1`、`stream: true`、`reasoning: { "effort": "none" }`。模型 deployment 名称由环境注入但必须等于批准部署，不允许客户端覆盖。服务端以 `DefaultAzureCredential` 获取 Azure Cognitive Services scope 的 token；本地开发仅允许开发者身份链，生产使用 Container Apps Managed Identity。

成功响应 `200 text/event-stream; charset=utf-8`，事件按下列 discriminated union 输出，每个 `data` 是单行 JSON：

```text
event: translation.delta
data: {"sessionId":"uuid","segmentSequence":1,"delta":"中文增量"}

event: translation.completed
data: {"sessionId":"uuid","segmentSequence":1}

event: translation.error
data: {"sessionId":"uuid","segmentSequence":1,"code":"TRANSLATION_UPSTREAM","stage":"translation"}
```

SSE 响应设置 `Cache-Control: no-store, no-transform` 和 `X-Accel-Buffering: no`。客户端断开时 BFF 立即 abort 上游请求。上游流在任何正文输出前失败时可返回标准 HTTP 错误；开始 SSE 后失败必须发 `translation.error` 并关闭。客户端只接受当前 session/sequence，未知、重复、越序或格式无效事件均中断，不猜测恢复。

### 错误契约

SSE 开始前的错误统一为：

```json
{
  "error": {
    "code": "STABLE_CODE",
    "stage": "speech | translation | configuration",
    "requestId": "opaque-id"
  }
}
```

稳定 code 包括 `INVALID_REQUEST`（400）、`ORIGIN_REJECTED`（403）、`SPEECH_TOKEN_UNAVAILABLE`（502）、`TRANSLATION_UPSTREAM`（502/503）、`PROTOCOL_ERROR`（502）、`CONFIGURATION_INVALID`（仅 readiness 失败，不向正常流伪装成功）。不得把 transcript、provider 响应正文、credential 或 stack trace 放入错误响应。

### 版本、兼容性与 contract test

当前内部 API 为同容器同版本发布，不单设 URL major version；JSON/SSE schema 由 `packages/contracts` 唯一定义。破坏性契约变更必须让 SPA、BFF 和 contract tests 在同一 candidate 中原子更新。锁文件固定 npm 依赖；Azure Speech SDK、Foundry API 路径或 reasoning 参数升级前必须在真实 integration 环境重新验证 `AC-001`～`AC-007` 和完整语言集合。contract tests 必须覆盖请求校验、SSE framing/顺序、abort 传播、上游错误映射、日志脱敏和非法 Origin。

## 安全、隐私、身份与 Secret

- 浏览器只获得短期 Speech token；长期 `SPEECH_KEY` 通过 Container Apps secret reference 注入 BFF，绝不写入 bundle、Git、image、日志、测试或 Delivery 文档。Foundry 使用 Managed Identity，不配置长期 API key。
- Container Apps Managed Identity 仅授予目标 Foundry deployment 的最小调用权限；Speech key 仅用于目标 Speech resource 的 token exchange。身份与 secret 均由获批 Azure 环境提供，仓库只声明变量名。
- 应用公开入口仅为 HTTPS。设置严格 CSP：默认同源，只允许脚本/样式/字体所需同源，以及 `connect-src` 中同源 API 和配置的 Azure Speech endpoints；禁止 object、frame embedding，并设置 `frame-ancestors 'none'`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`。
- BFF 校验 Origin、Content-Type、UUID、正整数 sequence、BCP 47 形态和非空 transcript。输入大小不得自行形成产品内容限制：上限由目标 Foundry deployment 的已验证请求限制和 Fastify 安全边界共同配置；超过已验证上限时明确中断，不截断、拆分或伪装成功。
- system instruction 与 user transcript 以 provider 结构化 role/content 分隔；模型输出只作为文本渲染，React 不使用 `dangerouslySetInnerHTML`。
- 不持久化音频、transcript、subtitle、session 或 IP 派生身份；页面刷新/关闭后内存内容消失。测试语音必须是获准的非敏感测试资产。

## 配置、可观测性与运维

服务启动时一次性校验以下配置：`PORT`、`PUBLIC_ORIGIN`、`SPEECH_REGION`、`SPEECH_KEY`、`SPEECH_AUTO_DETECT_LANGUAGES`、`AZURE_FOUNDRY_ENDPOINT`、`AZURE_FOUNDRY_DEPLOYMENT`。`AZURE_FOUNDRY_DEPLOYMENT` 必须指向批准的 `gpt-sol-6.1` deployment；语言集合必须来自验收环境的权威清单。secret 值不得出现在 `/api/config`、错误或启动摘要中。

结构化应用日志仅记录时间、level、requestId、随机 sessionId、segmentSequence、状态转换、处理阶段、依赖结果类别、HTTP status、取消标志和不含正文的耗时。明确禁止记录音频、transcript、subtitle、Speech token、key、Authorization header、Foundry request/response body 和麦克风设备标签。当前范围不新增外部 telemetry、告警产品或保留策略；平台标准输出采集由既有托管环境负责。

- `GET /health/live`：进程事件循环可响应即返回 200，不调用外部依赖。
- `GET /health/ready`：启动配置、静态资源和 adapter 初始化完成时返回 200；配置无效返回 503。不以伪造的外部成功响应判断 readiness。

运行人员通过平台 revision 状态、health、脱敏日志和 Azure 依赖自身状态判断故障阶段。任何额外 dashboard、告警阈值或日志保留政策须由后续获批治理提供，不能由本方案变成产品要求。

## SLO、限制、扩缩容、重试与恢复

- 唯一获批准的质量边界是会议期间持续产生字幕；没有数值 SLO。integration 和 QA 记录实际端到端行为，但不自行设定延迟、准确率、可用率或吞吐门槛。
- 支持范围受 Speech 在目标 region 的完整自动检测集合、单会话候选能力、Foundry deployment context/input 限制和 Azure quota 约束。候选能力低于 `AC-002` 时阻止发布，不缩减集合。
- BFF 无状态，Container Apps 可按真实并发 HTTP/SSE 连接与已批准 Azure quota 扩缩；初始 min/max replica 和并发触发值必须由部署环境依据 integration 测量与平台治理提供，不能在缺少证据时写入任意容量承诺。
- 当前流程不自动重试采集、recognition 或翻译，不在 replica 间转移在途 SSE。依赖失败立即中断当前流程，由用户在条件消除后手动重新发起。
- Speech token 的计划内刷新是凭据续期，不是业务重试；只在当前 generation 有效。Foundry SDK/HTTP client 禁用会掩盖中断的自动内容重放；底层连接建立失败不重复提交 segment。
- replica 终止时停止接收新请求并 abort 在途 Foundry 请求；浏览器观察连接结束后进入中断，不自动恢复。恢复依靠依赖恢复、平台 revision 健康和用户手动重新发起。

## 部署拓扑、迁移、Rollout 与 Rollback

多阶段 `Dockerfile` 在 Node.js 22 LTS builder 中执行 lockfile 安装、TypeScript/build，并把 SPA 静态产物及 Fastify production bundle 复制到精简的 Node.js 22 LTS Linux runtime image。容器以非 root 用户运行、只读应用文件系统、监听 `PORT`，暴露单一 HTTP port；TLS 在 Azure Container Apps ingress 终止。production image 不包含源码测试资产、开发依赖、`.env` 或 Delivery 报告。

Azure 拓扑是一个外部 HTTPS ingress 的 Container App、其 Managed Identity、目标 Azure AI Foundry deployment，以及浏览器直接访问的 Azure AI Speech resource。Speech secret 通过平台 secret reference 注入；Foundry 通过 Managed Identity。不得新增数据库、队列、持久卷或独立静态站点。

无数据 schema 或持久化迁移。应用协议变更随 SPA/BFF 同 image 原子发布。Rollout 创建指向 immutable digest 的新 revision，在其 readiness、平台验证及真实 integration 场景通过前不切换生产流量。`runtime/deployment.json` 记录 image、container port、health paths、必要非 secret 配置名、secret/identity 引用和 candidate 关联，不保存 secret 值。失败时把流量切回上一已验证 revision；由于无持久数据，无反向数据迁移。回滚不会恢复中断会话，用户按已批准行为手动重新发起。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 静态分析与类型检查 | Coding / 平台 CI | Node.js 22 LTS clean runner | lockfile；无需云凭据 | 命令、配置和可复现输出 | CI 执行后形成真实通过/失败结果 |
| 状态机 unit test | Coding / 平台 CI | Node.js 22 LTS + Vitest | fake timer/内存 adapter；无真实会议正文 | 发起、停止、晚到事件丢弃、中断、重新发起、严格顺序测试 | CI 执行后确认代码级生命周期规则 |
| API/adapter contract test | Coding / 平台 CI | Fastify inject + 受控 provider stub | 无 Azure secret；stub 仅验证协议 | schema、SSE framing、abort、错误映射、Origin 与日志脱敏测试 | CI 执行后确认内部契约；不替代真实集成 |
| 构建与容器验证 | 平台 CI | clean runner + container runtime | 声明的 Node/npm 与 image builder | lockfile build、immutable image、非 root、live/ready 辅助检查 | CI 执行后确认候选可构建运行；不证明产品流程 |
| Speech/Foundry 可行性与集成 | 远程 integration | 已批准目标 Azure 订阅、region 和 Container Apps 环境 | 真实 Speech、权威完整语言集合、`gpt-sol-6.1` deployment、Managed Identity/secret、麦克风 | adapter 诊断、部署清单、Playwright 配置和非敏感语音资产 | 下游确认单会话完整语言集合、流式输出、reasoning 关闭和真实身份可用；失败阻止发布 |
| 完整浏览器功能 E2E | 远程 integration / Playwright | 部署后的同一 immutable candidate | Chromium 麦克风输入、真实 Azure 服务与获批凭据 | `AC-001`、`AC-003`～`AC-007` 的 Playwright 场景和证据采集逻辑 | 下游产生连续字幕、启停、中断、恢复的真实结果 |
| 全语言范围验收 | Independent QA | 与 candidate 对应的 QA target 和验收时 Azure 权威集合 | 每种语言的可核验非敏感语音、真实 Speech/Foundry | `IQA-002` 数据驱动 Playwright 能力、输入/输出关联格式 | QA 逐一确认全部语言；不得抽样、mock 或用 health 替代 |
| 发布验证与回滚 | release verification | 同一 image digest 的 Container Apps revision | 平台 deployment identity 和上一已验证 revision | `deployment.json`、health paths、revision/rollback 操作说明 | 下游确认 candidate SHA、image digest、QA target 一致及回滚可执行 |

Coding 必须在 `runtime/deployment.json` 的 `developerSetupCommands` 声明 clean runner 所需的幂等项目准备，并在 `developerValidationCommands` 中以唯一分类对象准确提供非空的 `staticAnalysis`、`build`、`developerTests`；只有候选确实提供相应真实环境命令时才声明 `integrationTests` 或 `functionalTests`。这些命令不得是 no-op，也不得在失败后临时安装未声明依赖。

## 快速验证指南（Quickstart）

1. 安装 Node.js 22 LTS 和仓库 lockfile 依赖：`npm ci`。
2. 仅在本地 shell 或获批 secret store 设置所需环境变量；不得创建可提交的含 secret `.env`。
3. 运行开发者辅助验证：`npm run static-analysis`、`npm run build`、`npm run test`。这些结果不替代 Azure integration 或 Playwright E2E。
4. 用目标配置启动 production build：`npm run start`，检查 `/health/live` 与 `/health/ready`；health 只证明进程/配置状态。
5. 在获批 Azure integration 环境部署同一 immutable image，确认 `/api/config` 返回权威完整语言集合且不含 secret，并完成 Speech 单会话完整集合和 Foundry streaming/reasoning 配置预检。
6. 通过 Playwright 使用真实浏览器麦克风输入依次执行：手动发起与范围内语音产生中文字幕、同一流程连续多段字幕、手动停止后无新增采集/字幕、采集/Speech/语言检测/翻译分别中断可见、条件恢复后手动重新发起且不补发。
7. Independent QA 取得验收时权威完整语言集合，对每种语言逐一运行 `IQA-002`，并把输入语言、检测结果、中文字幕及 immutable candidate 标识关联保存到平台证据中。

## 支持 Runbook

- **配置/readiness 失败**：检查非 secret 配置是否齐全、deployment 是否为 `gpt-sol-6.1`、语言集合是否非空去重；从平台 secret/identity 引用修复，不在日志或工单粘贴值。新 revision 未 ready 时保持上一 revision 流量。
- **Speech token 或 recognition 中断**：按 requestId/sessionId 查看脱敏阶段日志和 Azure Speech 状态，确认 region、secret reference、quota 与完整语言集合能力。不得把 Speech key发给浏览器或缩减语言集合；恢复后由用户手动重新发起。
- **语言检测中断**：核对输入语言是否在验收时权威集合及 SDK 是否实际返回 language tag。若 SDK 单会话能力不能覆盖完整集合，停止候选发布并报告服务能力阻塞，不用预选、抽样或默认语言绕过。
- **翻译中断**：检查 Managed Identity 权限、Foundry endpoint/deployment、quota、streaming 和 reasoning-disabled 支持。不得切换模型、输出原文冒充中文或自动重放 transcript；恢复后手动重新发起。
- **字幕乱序或停止后出现字幕**：视为 generation/sequence/abort 契约缺陷，停止 rollout，保留不含会议正文的 requestId、sequence 和状态转换证据，回滚上一 revision。
- **会议内容疑似进入日志或持久层**：停止受影响 revision，限制证据访问，按平台既有安全流程处理；不得在本 Delivery 自创保留、通知或合规流程。修复脱敏后重新执行相关 contract 与真实 E2E。
- **revision 故障**：将流量切回上一已验证 immutable revision，确认 health；当前会话会中断，用户按产品行为手动重新发起。无数据库或消息迁移需要撤销。

## 开放决策

无。
