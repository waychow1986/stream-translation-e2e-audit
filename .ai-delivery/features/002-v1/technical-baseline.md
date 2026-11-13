# 技术基线 v1

- 模式：agent_proposed
- 批准人：技术负责人

## 技术要求

客户明确要求：采用 Azure AI Foundry 中的语音转文字（STT）服务与大模型完成整体能力；STT 负责浏览器会议语音的实时流式转写并开启源语言自动识别；大模型负责把转写文字持续翻译为中文并关闭 reasoning；模型可选择 gpt-sol-6.1；产品必须以浏览器访问的 Web App 交付，不得实现为桌面应用。

## 标准与约束

项目 Constitution 强制要求：产品行为与验收范围不得超出已批准需求；优先采用满足需求的最简单架构；保护会议内容和凭据并采用与风险相称的安全与隐私措施；必须使用 Playwright 对已批准的完整用户流程执行端到端功能测试，页面加载、局部检查或构造成功状态不能替代该证据；验证范围须必要且充分；重要决策保持需求、实现与验收可追溯并遵守平台现有交付治理；人类可读交付内容使用简体中文，固定代码、标识符和技术契约除外。

## 已批准的 Agent 建议

- 候选 A（推荐基线）——浏览器直连 STT、服务端代理翻译：采用 Node.js 22 LTS、TypeScript、React 与 Vite 构建 Web App，采用 Fastify 构建同仓库轻量 BFF，并以单一 Linux 容器部署到 Azure Container Apps。浏览器使用 Microsoft Azure Speech SDK 的 continuous recognition 与 continuous language identification，把麦克风音频直接流式发送到 Azure AI Speech；BFF 通过受控端点签发短期 Speech token，不向浏览器暴露长期密钥。浏览器把 finalized recognition segments 发送给 BFF；BFF 使用 Azure AI Foundry 模型推理 endpoint 调用 gpt-sol-6.1 deployment，以流式响应翻译为中文，显式关闭 reasoning，并通过 Server-Sent Events 向浏览器逐段返回字幕。该方案避免应用服务转发音频，组件最少、音频路径最短，适合当前单一 Web 字幕范围；代价是浏览器 Speech SDK 的兼容性及自动语言识别能力边界会直接影响产品。若目标订阅、区域或 gpt-sol-6.1 deployment 不能同时支持流式输出与关闭 reasoning，不得静默更换模型或伪造配置，必须在基线批准前确认可用 deployment。
- 候选 B——服务端统一处理 STT 与翻译：前端仍采用 Node.js 22 LTS、TypeScript、React 与 Vite；浏览器通过安全 WebSocket 把麦克风音频流发送到 Fastify 服务，服务端使用 Azure AI Speech SDK 执行 continuous recognition 和 continuous language identification，再调用 Azure AI Foundry 的 gpt-sol-6.1 流式翻译并经同一 WebSocket 返回字幕。可在服务端统一控制 SDK 版本、凭据、会话取消和错误映射，也能规避浏览器 Speech SDK 的部分兼容性差异；但音频经过应用服务会增加网络跳数、计算与并发连接负担，扩大会议内容处理面，并使横向扩缩容和连接排空更复杂。只有候选 A 经真实浏览器验证无法满足自动语言识别或稳定流式连接时才采用本方案；部署仍优先单一 Azure Container Apps 服务，不为当前范围增加消息队列、数据库或持久化存储。
- 候选 C——Azure App Service 承载候选 A 的 Web App/BFF：应用结构、Speech token、Azure AI Foundry 翻译流和安全边界与候选 A 相同，只把托管目标改为支持 WebSocket/SSE 的 Azure App Service for Linux。其运维模型较传统且部署直接，但容器可移植性、按流式连接弹性伸缩和修订级回滚能力弱于推荐的 Azure Container Apps。仅当客户现有 Azure 治理明确要求 App Service 时选择；不能仅为平台偏好改变已批准产品行为。
- 推荐基线的共同安全与数据边界：浏览器与服务端仅使用 HTTPS/WSS；Azure 托管环境优先通过 Managed Identity 访问 Azure AI Foundry，Speech 若必须使用 key，则只保存在 Azure Key Vault 或平台 secret store 并由 BFF 换取短期 token；任何长期凭据不得进入浏览器 bundle、源代码、日志、测试或 fixture。默认不持久化音频、转写或字幕，停止或中断时立即关闭采集、Speech recognizer、翻译流和网络连接。应用日志仅记录会话关联标识、状态转换、依赖调用结果与错误分类，不记录会议正文或音频；前端限制可信源、采用严格 CSP，并由 BFF 校验请求来源。上述控制实现 Constitution 的会议内容与凭据保护，不新增账户体系、归档、审计产品功能或未获批准的保留期限。
- 推荐基线的验证环境：开发者测试采用 TypeScript 静态检查、现有构建工具、针对状态机与协议适配器的单元/contract test；这些只能作为辅助证据。平台 CI 在 clean runner 上用锁文件安装 Node.js 22 LTS 依赖、构建 Linux 容器并运行静态检查和开发者测试。独立 Azure integration 环境必须提供真实 Azure AI Speech 与 Azure AI Foundry gpt-sol-6.1 deployment、Managed Identity/secret 和浏览器麦克风输入；Playwright 必须验证手动发起、连续语音到中文字幕、停止后不再采集或出字幕、各依赖中断可见以及条件恢复后手动重新发起。Independent QA 应依据验收时 Azure AI Speech 的权威自动检测语言集合逐一执行已批准的全部语言范围，不得以 mock、抽样、health check 或页面 smoke test 替代。
- 批准前技术可行性约束与运营边界：必须先在目标 Azure 订阅和区域验证 Azure AI Speech continuous language identification 是否允许单次会话覆盖验收要求的“服务可自动检测的全部源语言”。若 SDK/API 要求有限候选语言列表或存在低于完整集合的上限，则当前任何候选架构都不能满足 AC-002，必须报告为已批准产品范围与服务能力的阻塞，不得由实现自行缩减语言集合。运行区域须同时提供选定 Speech 能力和 gpt-sol-6.1 deployment；应用保持无状态且不引入数据库、消息总线、录音或字幕存储。容器提供独立存活与就绪检查；发布采用不可变 image 与 Container Apps revision，失败时回滚到上一 revision。扩缩容以真实并发流式连接和 Azure 配额为依据，在 integration 环境测得前不承诺任意容量、延迟、可用率、重试次数或告警阈值；依赖失败应终止当前处理并呈现已批准的中断状态，不自动补发停止或中断期间内容。