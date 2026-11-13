# Coding 后 Convergence 报告

## 评审范围

本次按 initial 模式评审当前 Candidate。核对范围包括 Constitution、`intent.md`、`spec.md`、`technical-baseline.md`、`design.md`、`tasks-implementation.md`、生产实现、单元/contract/Playwright 测试、合成音频 fixture、`Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` 与 `reports/implementation.md`。本阶段不执行命令，仅独立复核实施报告所载命令、结果及其与实现和测试代码的一致性。

## 结论

**需要修复（Repair Required）**。发现 2 项 HIGH 阻塞问题，均属于已有任务的实现或证据缺陷，应返回 Coding 修复；无须回退上游，亦无待人工决定事项。

## 阻塞问题

- **CONV-001**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：FR-004、NFR-001、AC-003、IQA-001 以及 T026～T027 要求 Foundry 流式增量在发言期间逐步进入字幕。`src/server/adapters/azure-foundry.ts:20-27` 先完整消费模型响应并把全部 delta 缓存在数组中，`src/server/translation-session.ts:89-108` 又在 `translate()` 完成后才集中发送 `subtitle.delta/final`。因此真实 Foundry 路径不会随模型流逐步向浏览器发送字幕，可能仅在整个片段翻译完成后集中显示，直接违背持续流式翻译和可观察连续性。
  - 修复建议：由 Coding 修复 T026/T027 的增量传播契约，使真实模型 delta 到达时立即按顺序发送，并增加能在模型流尚未结束时观察到前序 delta 的定向测试证据。

- **CONV-002**（severity：`high`；owner：`coding`；route：`current_stage`）
  - 证据：Constitution 第四节、IQA-001～IQA-003、spec“开发者验证”、design 验证矩阵以及 T014、T019、T024、T025、T033 要求 Playwright 使用合成 WAV 验证浏览器完整功能编排、发言期间渐进可见性和明确失败判定。现有 `tests/e2e/*.spec.ts` 均通过 `window.__TEST_PCM_FRAMES__` 注入构造字节，触发 `src/client/audio-capture.ts:19-25` 的测试旁路，未读取 `tests/fixtures/audio/iqa-en-multisegment.wav`，也未执行 `getUserMedia`、AudioWorklet 或 WAV 的真实浏览器输入路径。`tests/e2e/streaming-subtitles.spec.ts:12-16` 仅等待最终两条字幕后检查文本，没有在第二语义片段仍输入时断言第一条字幕已可见；`tests/e2e/rejection-cases.spec.ts:24-27` 仅对本地布尔函数逐项置假，不会使应用产生批量、非中文、乱序或语义不匹配结果。故实施报告宣称的“使用合成 WAV”“发言期间流式可见性”和完整反向判定没有对应可执行证据，Coding 环境必需的 Playwright 功能证据无效。
  - 修复建议：由 Coding 修复现有 Playwright 任务，使用已提交 WAV 驱动浏览器音频流程，记录输入进度并在后续片段仍输入时断言前序中文字幕可见；让反向场景实际驱动应用产生各类不合格结果并断言验收失败，同时保留 deterministic adapter 与真实 Azure 验收之间的边界。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| FR-001 / AC-001 / IQA-001、IQA-003 / T010～T017 | `src/client/audio-capture.ts`、`src/client/audio-worklet.ts`、`src/server/adapters/azure-speech.ts`、`src/server/translation-session.ts` | `tests/contract/speech-stream.contract.test.ts`、`tests/e2e/audio-stream.spec.ts`、`tests/fixtures/audio/` | 生产路径存在，但 Playwright 绕过麦克风、AudioWorklet 与 WAV，完整浏览器证据不足（CONV-002） |
| FR-002、FR-003 / AC-002 / IQA-002 / T018～T021 | `src/server/adapters/azure-speech.ts`、`src/client/App.tsx` | `tests/contract/azure-speech.contract.test.ts`、`tests/e2e/language-detection.spec.ts` | 英语候选、主标签过滤、无语言选择及中文目标有实现与局部证据；真实识别留待 Independent QA |
| FR-004、FR-005、NFR-001 / AC-003、AC-004 / IQA-001、IQA-003 / T022～T029 | `src/server/adapters/azure-foundry.ts`、`src/server/translation-queue.ts`、`src/server/translation-session.ts`、`src/client/subtitle-reducer.ts` | `tests/contract/foundry.contract.test.ts`、`tests/unit/translation-queue.test.ts`、`tests/e2e/streaming-subtitles.spec.ts` | 真实 Foundry delta 被缓冲至流结束，且渐进时序测试无效（CONV-001、CONV-002） |
| design HTTP、配置、安全与生命周期契约 / T004～T009、T030～T032 | `src/shared/`、`src/server/config.ts`、`src/server/security.ts`、`src/server/routes.ts`、`src/server/websocket.ts` | `tests/contract/`、`tests/unit/resource-cleanup.test.ts` | 协议、配置、同源、安全头、身份端点和基础清理具备对应测试；未发现独立 HIGH 阻塞 |
| design 部署拓扑与验证环境 / T033～T036 | `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh` | `tests/contract/candidate-runtime.contract.test.ts`、`reports/implementation.md` | 就绪制品齐全，但功能脚本执行的 Playwright 证据受 CONV-002 阻塞 |

## 开发者验证证据复核

实施报告记录 `npm ci`、Chromium 安装、typecheck、build、4 个 unit 文件 5 项测试、9 个 contract 文件 15 项测试、5 项 Playwright、Docker build、容器 health/identity/UID 检查和两次 audit 均以退出码 0 完成；命令名称、脚本入口与仓库配置基本相符。静态检查、构建、单元、contract、容器及依赖审计记录可作为辅助证据。

Playwright 的“5 项通过”仅证明当前 deterministic 旁路按预置帧返回预置字幕。测试代码未消费批准的 WAV、未覆盖真实浏览器采集链路、未断言后续语音仍输入时前序字幕已经可见，反向判定也未驱动应用失败行为。因此该退出码不能支持实施报告对 T014/T024/T025 及 Coding 责任内完整功能证据的成功声明。真实 Azure 未在 Coding 中执行的说明属实，不把该下游结果缺失作为阻塞。

## 用户可见行为比较

- 开始/停止控件、无源语言选择、检测语言展示、中文字幕区域和英语到中文固定方向与 FR-001～FR-005 的界面边界一致。
- Speech finalized 英语片段按会话顺序进入单消费者队列，客户端按 `segmentId` 排序，支持字幕顺序不变量。
- 真实模型输出在服务端被完整缓冲后才转发，用户不能在该片段翻译流进行时逐步看到 delta；这与 FR-004、NFR-001 和 AC-003 的持续呈现要求冲突（CONV-001）。
- 未发现账户、存储、会后记录、额外语言、额外目标语言或其他未请求产品能力。

## 架构、Contract、运维与任务覆盖

单容器 Node.js 22、React/Vite/Fastify、服务端 Speech/Foundry、Workload Identity、无数据库/队列/持久化的结构符合批准设计。严格 JSON schema、同源 WebSocket、CSP、配置启动校验、非 root UID 10001、`/healthz`、`/candidate-identity`、候选身份原样返回及 deterministic adapter 的非测试环境拒绝均有实现和 contract 覆盖。`Dockerfile`、`runtime/deployment.json` 和功能脚本已创建，平台后续阶段具备基本执行入口。

任务计划已为全部批准行为和 Coding 证据分配 T001～T036，不存在需要新增 `feature-task` 的规划缺口。CONV-001 属 T026/T027 实现错误，CONV-002 属 T014/T019/T024/T025/T033 证据实现不完整，均应直接返回 Coding。未发现需要引入外部产品、telemetry backend、身份产品、告警、保留策略或额外运维依赖。

## 延后平台证据

以下证据按批准责任矩阵由后续平台阶段产生，当前缺失不构成阻塞：不可变 Candidate SHA 重跑、ACR 镜像摘要、AKS/LoadBalancer 部署、Workload Identity 与环境变量注入、真实 Speech endpoint/ARM resource ID 配对、真实 continuous language identification、长会话令牌刷新、真实 Foundry 流式及关闭 reasoning 能力、Independent QA 的 IQA-001～IQA-003、UAT、发布审批、GitHub review 与 merge。

## 非阻塞观察与剩余风险

- `reports/implementation.md` 的真实 Azure 风险声明与阶段责任边界一致；不得把本地 deterministic 通过解释为 IQA 通过。
- `tests/fixtures/audio/iqa-en-multisegment.wav` 及语义清单已经提交，可直接用于修复 CONV-002，不需要人工提供素材。
- 当前无 CRITICAL 问题、无待澄清的批准制品矛盾、无平台事件，也无需要人工输入或决定的事项。
