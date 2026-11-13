# BUG-001 缺陷评估

## 缺陷信息

- **Bug ID：** BUG-001
- **QA Run ID：** Independent QA 结果未提供独立 Run ID
- **Candidate SHA：** `36ddbb8ba84d84f3958cf7af846c5ab9c24059e7`
- **环境：** `http://74.159.182.40`

## 问题报告

Independent QA 的 IQA-001、IQA-002、IQA-003 均在等待首个 `data-testid="subtitle"` 元素时于 120000 ms 后超时，完整浏览器流程未完成。人工审批意见 `HT-DLV-20261113-96F0EE0F92F9-0012` 要求重新评估 BUG-001，并提供了沿同一调用链取得的三项独立结论：

1. HTTP 候选地址所需的 Chromium 安全来源参数、麦克风权限和 fake media 注入均可由 QA 脚本控制，属于测试缺口。
2. 运维已在部署环境复现 Foundry client 未传 `apiVersion` 时抛错并返回 `session.failed/MODEL_UNAVAILABLE`。
3. 运维已复现 `getUserMedia` 不可用或被拒后页面仍显示“正在聆听”，且用户看不到错误。

本评估保留三项根因的独立性；QA 配置问题交回 QA 计划，两个有代码与部署复现证据支持的产品缺陷进入限定修复。

## 预期与实际行为

- **预期：** QA 使用可控的 Chromium 参数和合成语音完成采集；产品自动检测英语，经实际 Azure AI Speech 与 Azure AI Foundry 流式生成中文字幕。Foundry 调用不依赖部署环境额外提供未声明的 `OPENAI_API_VERSION`。若浏览器无法启动麦克风，页面应停止显示聆听状态并向用户呈现启动失败。
- **实际：** QA 未配置或未证明配置安全来源、麦克风权限及 fake media 注入，三个场景停在字幕等待。即使补齐该测试条件，真实 Foundry 路径仍因 `getAzureOpenAIClient()` 缺少 `apiVersion` 而产生 `MODEL_UNAVAILABLE`；麦克风启动失败时，客户端保留“正在聆听”状态且未呈现错误。

## 复现步骤与证据

1. Independent QA 在 `http://74.159.182.40` 执行 IQA-001 至 IQA-003，等待 `getByTestId('subtitle').first()` 可见，三次均得到 `locator.waitFor: Timeout 120000ms exceeded`，且 `evidence` 为空。
2. `playwright.config.ts:11-17` 已证明 Playwright 可自行授予麦克风权限，并通过 Chromium 参数启用 fake media 和注入合成 WAV；人工审批进一步指定 HTTP 候选需加入 `--unsafely-treat-insecure-origin-as-secure=<QA_BASE_URL>`。因此这些条件由 QA 控制，不是平台环境故障。
3. 运维在部署环境复现：`src/server/adapters/azure-foundry.ts:10` 调用 `project.getAzureOpenAIClient()` 时未传 `apiVersion`；在没有 `OPENAI_API_VERSION` 时 `@azure/ai-projects` 直接抛错。`src/server/translation-session.ts:103-138` 捕获该翻译异常并发出 `MODEL_UNAVAILABLE`，因此不会产生字幕。显式传入 `apiVersion: "2025-04-01-preview"` 后调用成功。
4. `src/client/translation-client.ts:54-58` 在收到 `session.started` 后先把状态设为“正在聆听”，再等待 `capture.start()`；`src/client/audio-capture.ts:13-17` 中的 `getUserMedia` 拒绝会使该 Promise 失败。此分支没有捕获、状态回退或用户错误呈现，静态调用链与运维复现一致。

## 影响追踪

- **Requirement：** FR-001、FR-004、FR-005、NFR-001。
- **Acceptance：** AC-001、AC-003、AC-004。
- **Scenario：** IQA-001、IQA-002、IQA-003。
- **Task：** T014、T015、T017、T022、T024、T026、T028、T029、T030。
- **设计契约：** TD-002、TD-005；Foundry adapter Contract；`failed` 生命周期与资源释放约束。

## 根因分析

- **QA 测试缺口：** QA 脚本未配置或未提供证据证明已配置安全来源、麦克风权限、fake media 与合成音频注入。上述条件均能由 Playwright/Chromium 启动配置解决，不需要运维改变 HTTP 候选环境，也不得通过产品测试接口补偿。
- **产品缺陷一：** Azure Foundry adapter 创建 OpenAI client 时遗漏 SDK 所需的 `apiVersion`。现有应用配置未声明 `OPENAI_API_VERSION`，部署也不应隐式依赖它；异常沿翻译队列映射为 `session.failed/MODEL_UNAVAILABLE`，直接阻断 FR-004、AC-003 和 AC-004。
- **产品缺陷二：** 客户端在麦克风真正启动前过早进入“正在聆听”状态，且 `capture.start()` 的拒绝没有失败处理。结果是 UI 状态与实际采集状态不一致，用户无法得知 FR-001 未启动，相关音频与 WebSocket 资源也缺少该分支的明确收束。

现有 Foundry contract test 只覆盖抽象 `FoundryTranslator`，没有约束 `AIProjectClient.getAzureOpenAIClient` 的创建参数；现有 E2E 只覆盖成功采集，没有覆盖麦克风拒绝。因此两个缺陷均逃过候选验证。

## 限定范围的修复方案

1. 仅在 Azure Foundry adapter 创建 OpenAI client 时显式传入已由运维验证可用的 `apiVersion: "2025-04-01-preview"`，并为真实 adapter 边界增加参数 contract 覆盖；不新增环境变量、不切换模型、不改变翻译协议。
2. 仅在客户端麦克风启动分支捕获 `capture.start()` 失败：停止并清理已取得的媒体资源、结束当前连接、退出“正在聆听”状态并呈现明确的麦克风启动失败状态；增加 `getUserMedia` 不可用和权限拒绝的定向测试，不增加测试专用产品接口。
3. QA 计划独立修正浏览器启动配置后，在修复候选上重跑 IQA-001 至 IQA-003，并采集音频输入进度、WebSocket 终止事件、字幕变化和实际依赖关联证据。

## 回归风险

- 固定 API version 可能与后续 SDK 或服务版本升级产生兼容风险；回归应覆盖流式 delta、request ID、取消、错误映射及批准 deployment 不变。
- 麦克风失败清理可能与 WebSocket `onclose`、组件卸载或用户重试并发，需验证清理幂等、失败后可重新开始、成功采集与停止流程不受影响。
- QA 参数若只补安全来源而遗漏权限或 fake media，仍会复现字幕超时；该风险属于 QA 计划，不应扩大产品修复范围。

## 未解决证据

Independent QA 尚未提供 Chromium 完整启动参数、Playwright trace、浏览器控制台、输入音频进度、WebSocket 消息或 Azure 调用关联记录，因此当前超时不能量化归因于三项根因中的哪一项或各自占比。人工审批提供的运维复现和代码调用链已足以使两个产品缺陷进入修复，但修复完成后仍必须在同一类真实部署环境中、使用纠正后的 QA 脚本重跑 IQA-001 至 IQA-003，才能形成 AC-001 至 AC-004 的验收结论。

## 分类与修复就绪决策

- **classification：** `product_defect`
- **ready_for_fix：** `true`
- **决策依据：** QA 启动条件单独归为 `test_gap` 并交回 QA 计划；BUG-001 同一失败链上另有两个经运维复现且由代码调用链直接支持的产品缺陷，修复边界和回归范围明确，不需要新增业务或产品决定，可以进入 Coding Repair。
