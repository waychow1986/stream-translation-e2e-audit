# IQA-002 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-002
- **QA Run ID：** 本次 Independent QA（未提供独立 Run ID）
- **Candidate SHA：** `7083a475b0626d45854acf935c12caa2f49a2421`
- **环境：** `http://20.7.107.68`

## 问题报告

双片段英文输入没有产生 final 翻译或固定字幕，无法验证首段完整译文替换、固定及后续不可变。

## 预期与实际行为

依据 `FR-006`、`FR-008`、`AC-003` 与 `AC-004`，首段 final 应以完整译文替换草稿并固定，第二段不得改写首段。实际 Speech WebSocket 为 1 个但 0 帧，final 翻译请求和固定片段均为 0。

## 复现步骤与证据

QA 启动候选会话并尝试播放双片段英文合成 WAV。会话、token 与 WebSocket 建立成功，无控制台错误或网络失败；WebSocket 没有任何音频帧，所以没有 recognition final、翻译请求或固定片段。

## 影响追踪

影响 `US-002`、`FR-006`、`FR-008`、`SC-002`、`AC-003`、`AC-004`、场景 `IQA-002`，以及任务 `T003`、`T011`、`T012`、`T015`、`T018`、`T019`。

## 根因分析

当前连接已越过上一轮 CSP 阻塞，但 QA 只记录 WAV 已生成，未证明 WAV 经 Playwright fake microphone 实际送入浏览器。产品的默认麦克风 adapter 在 0 帧条件下不可能产生 final；`session-controller` 的 final 翻译及 reducer 固定路径均未收到输入。媒体设备、文件注入、权限和 HTTP 地址安全上下文均可由 QA 浏览器启动配置控制，故这是测试缺口。现有证据不支持把未执行的 final 或固定逻辑判为产品缺陷。

## 限定范围的修复方案

仅修订 QA 脚本，建立并预检可被 Chromium 采集的双片段 fake microphone 输入，配置权限与 HTTP 测试地址安全上下文，并以 WebSocket 非零帧作为进入 final 断言的前置门槛；不得修改翻译、reducer 或产品接口。

## 回归风险

无帧门槛缺失会继续产生连锁误报；音频片段边界不清会导致 Speech 不产生两个 final。QA 修订后需保留每段输入、final 翻译、固定 ID/文本及第二段期间不变的连续证据。

## 未解决证据

当前没有真实 final、Foundry 流或固定状态证据；修订 QA 后须重跑，非零帧条件下出现的新失败应重新评估。

## 分类与修复就绪决策

- **classification：** `test_gap`
- **ready_for_fix：** `true`
- **决策依据：** 可观察失败由 QA 可配置的媒体注入未产生帧直接解释，尚无产品 final 链路失败证据。
