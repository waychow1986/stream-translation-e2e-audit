# Coding 后 Convergence 报告

## 评审范围

本次按 initial 模式评审修复后的当前 Candidate。核对 Constitution、`intent.md`、`spec.md`、`technical-baseline.md`、`design.md`、`tasks-implementation.md`、生产实现、单元/contract/Playwright 测试、合成音频、`Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` 与 `reports/implementation.md`。本阶段不执行命令，仅独立复核实施报告所载命令、结果及其与代码和测试的一致性，并重新检查 CONV-001、CONV-002。

## 结论

**需要修复（Repair Required）**。CONV-001 与 CONV-002 已有对应实现及测试修复，不再阻塞；本轮穷尽检查发现 2 项新的 HIGH 阻塞问题，均为既有任务的实现或必需证据不完整，应返回 Coding 修复。无须回退上游，无待人工决定事项。

## 阻塞问题

- **CONV-003**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：design“数据流、状态、并发与生命周期”和“安全、隐私、身份与 Secret”、T015、T030、T032 要求断连及 SIGTERM 停止 MediaStreamTrack、Speech stream/recognizer、模型流和 WebSocket，并要求失败后可手动新建会话。`src/client/translation-client.ts:18-43` 只在收到 `session.failed` 时停止采集，没有注册 WebSocket `close` 处理；连接被服务器、网络或 SIGTERM 关闭时，浏览器麦克风、AudioWorklet 与 MediaStreamTrack 会继续运行。`src/server/index.ts:9-17` 仅调用 `app.close()`，`src/server/websocket.ts:23-50` 未跟踪活动 Session 或等待其清理；`tests/unit/resource-cleanup.test.ts` 只直接调用 `AudioCapture.stop()`，`tests/contract/shutdown.contract.test.ts` 只直接调用 `session.fail()`，均未执行 WebSocket 断连或 SIGTERM 路径。因此用户可见采集边界和强制资源释放不变量未实现，实施报告对 T030/T032 的完成声明缺少有效证据。
  - 修复建议：由 Coding 在连接关闭、连接错误和进程终止路径中幂等停止客户端采集并取消服务端全部活动依赖，确保清理完成后再结束关闭流程；补充实际驱动 WebSocket 断连和 SIGTERM 的定向测试，并证明麦克风、Speech、模型流及连接均已释放且可手动开始新会话。

- **CONV-004**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：design“Interface 与契约”“安全、隐私、身份与 Secret”及 T018 明确要求 contract test 验证 Azure Speech SDK 的 continuous language identification、完整 `aad#<resourceId>#<token>` 初始赋值、按到期时间刷新时同时更新 `SpeechConfig` 与活动 recognizer、畸形 resource ID 失败；T012 还要求取消和 Speech 错误映射。`tests/contract/azure-speech.contract.test.ts:8-19` 只测试三个纯辅助函数，未实例化 `AzureSpeechAdapter`、未记录 SDK 调用、未验证初始配置或活动 recognizer 刷新；`tests/contract/speech-stream.contract.test.ts:4-22` 仅测试 deterministic adapter。故 Workload Identity Speech 真实 adapter 的关键凭据生命周期和 SDK 参数没有 Coding 环境可执行证据，实施报告将其列为已通过 contract 覆盖并不成立。
  - 修复建议：由 Coding 为既有 T012/T018 增加可执行的 Azure Speech adapter contract test，以记录式 SDK/credential fake 验证初始授权、continuous language identification、活动 recognizer 刷新、取消及稳定错误映射；测试必须先对当前缺口失败，再在修复后通过，且不得记录 token。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-001 / AC-001 / IQA-001、IQA-003 / T010～T017 | `src/client/audio-capture.ts`、`src/client/audio-worklet.ts`、`src/server/adapters/azure-speech.ts`、`src/server/translation-session.ts` | `tests/e2e/audio-stream.spec.ts`、`tests/fixtures/audio/` | 合成 WAV 已经 Chromium fake microphone、`getUserMedia`、AudioWorklet 和 WebSocket 逐帧进入应用；CONV-002 对应缺口已修复 |
| FR-002、FR-003 / AC-002 / IQA-002 / T018～T021 | `src/server/adapters/azure-speech.ts`、`src/client/App.tsx` | `tests/contract/azure-speech.contract.test.ts`、`tests/e2e/language-detection.spec.ts` | 用户流程局部证据存在，但真实 Speech adapter 的授权配置与刷新 contract 证据缺失（CONV-004） |
| FR-004、FR-005、NFR-001 / AC-003、AC-004 / IQA-001、IQA-003 / T022～T029 | `src/server/adapters/azure-foundry.ts`、`src/server/translation-queue.ts`、`src/server/translation-session.ts`、`src/client/subtitle-reducer.ts` | `tests/contract/foundry.contract.test.ts`、`tests/contract/websocket-session.contract.test.ts`、`tests/e2e/streaming-subtitles.spec.ts`、`tests/e2e/rejection-cases.spec.ts` | 模型流结束前 delta 可观察，输入期间渐进字幕及实际反向场景已有证据；CONV-001、CONV-002 对应缺口已修复 |
| design 生命周期与资源释放 / T030、T032 | `src/client/translation-client.ts`、`src/server/index.ts`、`src/server/websocket.ts`、`src/server/translation-session.ts` | `tests/unit/resource-cleanup.test.ts`、`tests/contract/shutdown.contract.test.ts` | WebSocket 断连和 SIGTERM 的端到端清理实现及测试不完整（CONV-003） |
| design HTTP、安全、候选运行与部署 / T004～T009、T031、T033～T036 | `src/shared/`、`src/server/config.ts`、`src/server/security.ts`、`src/server/routes.ts`、`Dockerfile`、`runtime/deployment.json` | `tests/contract/`、`runtime/developer-functional-run.sh`、`reports/implementation.md` | 协议、配置、同源、安全头、health、identity、非 root 容器及功能入口已就绪；未发现独立 HIGH 阻塞 |

## 开发者验证证据复核

最新实施报告记录新增回归测试先以退出码 1 复现 CONV-001、CONV-002，随后 clean install、Chromium 安装、typecheck、build、4 个 unit 文件 5 项测试、9 个 contract 文件 16 项测试、10 项 Playwright、脚本语法、Docker build、容器 health/identity/UID、依赖审计和敏感模式扫描均通过。命令、脚本入口、测试数量和当前仓库配置相符；修复后的 Playwright 确实使用提交 WAV 和真实浏览器音频链路，并在输入继续时检查前序字幕，反向场景也实际改写应用接收的事件。CONV-001、CONV-002 已有可信 Coding 证据。

但“9 个 contract 文件通过”不能证明每个已批准 contract 均被实际验证：Azure Speech 测试没有执行 adapter 的 SDK 配置或令牌刷新路径（CONV-004）。同样，现有资源清理测试没有触发浏览器 WebSocket 断连或进程 SIGTERM，无法支持实施报告对这些生命周期路径的成功声明（CONV-003）。真实 Azure 未在 Coding 中执行的说明属实，不把该下游结果缺失作为阻塞。

## 用户可见行为比较

- 手动开始、浏览器语音采集、无源语言选择、英语自动检测、固定中文目标、输入期间逐步显示字幕及停止后的帧截止行为与 FR-001～FR-005、NFR-001 和 AC-001～AC-004 一致；当前 deterministic Playwright 证据仅证明应用编排。
- Foundry delta 已在模型流完成前转发，字幕按 `segmentId` 排序；未发现原文展示、额外语言、会后记录或其他未请求能力。
- WebSocket 非正常关闭时客户端没有停止音频采集，用户即使已失去翻译连接仍可能保持麦克风活动；这违背批准的断连采集边界和资源释放不变量（CONV-003）。

## 架构、Contract、运维与任务覆盖

单容器 Node.js 22、React/Vite/Fastify、服务端 Speech/Foundry、Workload Identity、无数据库/队列/持久化的结构符合批准设计。严格客户端消息 schema、同源 WebSocket、CSP、启动配置、非 root UID 10001、`/healthz`、`/candidate-identity`、确定性 adapter 的生产拒绝、Dockerfile 和 deployment contract 均存在。未引入无批准追踪关系的外部产品、telemetry backend、身份产品、告警、保留策略或运维依赖。

任务计划已为全部批准行为和 Coding 证据分配 T001～T036，不存在 task-planning 缺口。CONV-003 是 T015/T030/T032 的实现与测试不完整，CONV-004 是 T012/T018 的必需 contract 证据缺失，均直接返回 Coding，不追加任务，不回退上游。

## 延后平台证据

以下证据按批准责任矩阵由后续平台阶段产生，当前缺失不构成阻塞：不可变 Candidate SHA 重跑、ACR 镜像摘要、AKS/LoadBalancer 部署、Workload Identity 与环境变量注入、真实 Speech endpoint/ARM resource ID 配对、真实 continuous language identification、长会话真实令牌刷新、真实 Foundry 流式及关闭 reasoning 能力、Independent QA 的 IQA-001～IQA-003、UAT、发布审批、GitHub review 与 merge。

## 非阻塞观察与剩余风险

- `reports/implementation.md` 正确声明 deterministic Playwright 不构成真实 Azure 集成通过证据；该边界必须继续保留。
- `dependency.evidence` 的非测试 Speech/Foundry 标识、真实语义质量和实际服务流式粒度只能由后续 Independent QA 核验。
- 当前无 CRITICAL 问题、无批准制品歧义或矛盾、无平台事件，也无需要人工输入或决定的事项。
