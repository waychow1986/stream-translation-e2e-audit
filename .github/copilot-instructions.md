# GitHub-native 交付指令

本仓库为每个 SDLC 阶段使用相互隔离的 GitHub Copilot cloud session。不同 Session
不共享聊天历史或 sandbox 状态；唯一获批准的阶段交接方式是已提交的仓库内容。必须从
`.ai-delivery/context.json` 的 `activeFeatureDirectory` 解析当前迭代目录，并将每个
Feature 制品写入该目录。绝不能修改 `.ai-delivery/features/` 下的其他目录；已发布和
以前的迭代目录均不可变。缺少 `.ai-delivery/context.json` 是阻塞错误，不得猜测或创建
其他制品布局。正式 QA 缺陷使用独立的
`.ai-delivery/bugfixes/<BUG-ID>-<slug>/` 目录，绝不能将修复制品写入 Feature 目录。

- 将 `.ai-delivery/templates/` 视为只读 Markdown 结构契约。创建或重写
  人类可读制品前，读取对应的 `*.template.md`，保留必需章节和顺序，用当前 Delivery
  内容替换说明与示例，并在提交前删除未使用的占位内容。模板不是权威 Delivery 制品，
  阶段 Agent 不得修改模板。
- 即使仓库安装了参考模板，项目 Constitution 和已批准 technical baseline 仍由平台
  管理。机器投影和 runtime contract 使用对应 JSON Schema，不使用 Markdown 模板。
- 所有人类可读 Markdown 制品均使用简体中文。代码、命令、文件路径、标识符、JSON key、
  protocol 名称、专有名词和引用的源文本按其要求保留原文。编排 JSON 面向机器，不得重复
  Markdown 内容。
- 严格保持阶段职责。Intent 负责业务问题、原因、期望结果、受影响用户与系统、客户明确
  能力、范围、约束、优先级、依赖、风险和开放业务问题。Specification 负责 User Story、
  FR/NFR、产品行为、领域规则、成功标准、验收标准和验收证据，不得包含架构或实现细节。
  Technical Solution 负责所有实现选择，不得改变已批准产品行为。
- Specification 的“完整”只表示已批准业务意图范围内的产品行为闭合，不表示必须为
  性能、可靠性、安全、隐私、可访问性、合规或其他质量维度新增目标。每个
  US/FR/NFR/SC/AC/IQA 必须具有可核验的权威来源：原始请求支持的已批准 INT、该 INT
  为消除行为断点所必需的最小闭合、直接规定用户可见行为的准确 Constitution 条款，
  或已接受的 PQ 答案。笼统的“符合 Constitution”、行业惯例、最佳实践、模板章节或
  测试便利性不是产品要求来源。
- 缺少某个质量维度不自动构成产品歧义。只有已批准输入已经要求该维度、但存在多个会
  实质改变产品契约的合理解释时，Specification 才能提出 PQ。可选增强、新质量目标、
  数值阈值、正式标准等级、测试工具、人工测试方法和额外门禁不得通过默认值或 PQ 引入。
  可验证不等于必须数字化；只有权威来源要求数值边界时才创建数值指标。
- 每个阶段都必须通过自身质量门禁。Intent 没有前置制品，因此只检查自身。
  Specification、Technical Solution 和 Task Planning 在流程继续前，必须同时完成
  自检和与已批准直接前置制品的一致性检查。
- 阶段门禁发现不一致时，默认修复当前阶段，因为前置制品已经人工批准。只有已批准前置
  制品本身存在重大歧义、矛盾、不可实现义务、不安全行为或治理冲突时，才能返回上游。
  实现偏好、便利性或替代设计绝不是上游例外。
- Intent 和 Specification 门禁必须先检查权威来源和未经批准的产品范围扩展，再检查
  批准范围内的完整性。未被权威来源触发的产品质量维度可以明确记录为“当前没有获批准
  的额外要求”，不得因此判定 Intent 或 Specification 不完整。Technical Solution 和
  Task Planning 继续按各自已批准直接前置制品及阶段特定契约检查，不套用产品来源类型。
- 默认技术流程依次为 Technical Solution、自身阶段门禁、Task Planning、自身阶段门禁，
  然后进入 Portal 技术审批。Coding 后执行独立 Convergence，对照已批准制品检查实现。
  默认流程不再执行最终跨制品 Analyze。
- 阶段工作开始前读取项目级 `.ai-delivery/constitution.md`。Technical Solution、
  Task Planning、Coding 及后续阶段还必须读取 active Feature 的
  `technical-baseline.md`。Intent、Specification 及其阶段检查在技术基线选择前
  运行，因此此时缺少 `technical-baseline.md` 属于正常情况，绝不能作为 Intent
  或 Specification 阻塞项。只有当前阶段必需的治理文件缺失，或其他制品与已批准治理
  冲突时，才能停止并报告阻塞。
- Constitution 和 technical baseline 决策优先于阶段提示和生成计划。Agent 可以报告
  冲突，但不得静默削弱、替换或重新解释已批准治理。
- 修改前读取当前阶段制品。
- 只能在所选 custom agent 的职责范围内工作。
- 在阶段制品中记录假设、未解决问题和证据。
- 不得虚构审批、测试结果、外部服务行为或凭据。
- 不得在源代码、日志、测试、fixture 或生成文档中写入 secret。
- 测试必须证明用户可见行为。Unit test、mock、health check、build 成功和页面加载
  smoke test 只能作为辅助证据，不能替代必需的 functional、integration 或
  end-to-end 场景。
- 已批准行为依赖外部系统时，必须通过已批准身份和 integration 环境规划并实现真实环境
  测试。不得假设 technical baseline 中不存在的 provider，也不得在 integration
  不可用时将离线替代结果视为通过。
- `.github/workflows/` 下的文件归 AIDelivery Hub 所有。Agent 绝不能创建、修改、
  重命名或删除这些文件。
- Production candidate 必须包含 Dockerfile 和 active iteration 目录下的
  `runtime/deployment.json`。部署 image、candidate SHA 和 QA target 必须指向同一
  不可变 Candidate。
- 平台 Runner 提供稳定的公共工具。Candidate 必须在 `developerSetupCommands` 中声明
  幂等的项目特有 runtime 准备步骤。`developerValidationCommands` 必须是唯一分类
  对象，准确包含 `staticAnalysis`、`build`、`developerTests` 三个必选类别；
  `integrationTests`、`functionalTests` 仅在候选明确声明时适用，不从上游自然语言
  推断或要求，不允许其他类别或旧扁平数组。每个出现的类别是非空字符串数组，
  仅去除首尾 ASCII 空格、Tab、CR、LF 后非空且在类别内区分大小写唯一。
  no-op 检查再至多去一个末尾分号并 trim，仅拒绝精确 `true`、`:`、
  `exit` 加空格/Tab 再加 `0`，或准确 `echo`/`printf` 的简单输出形态：命令名后
  只能以空格/Tab 分隔参数，剩余文本不含 CR、LF、`;`、`&`、`|`、`<`、`>`、
  `(`、`)`、`$`、反引号、反斜杠，引号不豁免。不作广义关键词、工具白名单或
  shell 语义推断。完整声明通过后才可 setup，再按上述类别顺序执行；保留每个原始
  字符串边界和真实 stdout/stderr、退出码，首次失败停止并禁止部署。
  CI 在测试前安装已声明依赖和工具；不得依赖预热 cache，也不得在检查失败后
  临时安装未声明 package。分类检查不替代既有部署后功能脚本或其他门禁。
- Coding 和 Convergence 位于平台 CI、image publication、远程部署、Independent QA、
  UAT、发布审批、review 和 merge 之前。Agent 必须准备并验证这些下游门禁所需输入，
  但不得因为未来才会产生的 SHA、digest、target、QA、审批或 merge 证据不存在而阻塞
  早期阶段。
- 除非已批准 Intent 和 Specification 明确改变行为，否则必须保留现有行为。
- 完成前执行仓库文档规定的验证命令。
- 绝不能 merge pull request。将变更和证据留给独立 Review 与 GitHub Actions 验证。
