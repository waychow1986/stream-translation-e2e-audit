# 实时流式翻译 Independent QA 计划

## 执行边界

- 执行前在五分钟内重试 DNS、连接、TLS（如适用）、`QA_HEALTH_PATH` 健康检查与 `/candidate-identity` 不可变身份校验；任何前置失败均作为环境阻塞，不执行验收场景。
- 使用 Azure Speech 合成两段含义明确的英语语音并拼接受控静音区间。Playwright 启动 Chromium 时自行配置 HTTP 安全来源、麦克风权限、fake media 和合成 WAV 注入，不要求产品提供测试接口。
- 通过浏览器控制台、失败请求、WebSocket 收发消息、音频帧进度、页面状态、字幕 DOM 与 `dependency.evidence` 设置采集、请求、依赖返回和结果呈现检查点。
- 本次提示未提供正式 Bugfix 复测 ID，因此结果中的 `bugfixResults` 为空数组。

## 验收任务

- [ ] **IQA-001** 英语发言期间持续出现中文字幕
  - **追溯：** INT-001、INT-002、INT-003、INT-004、INT-006；US-001、US-003；FR-001、FR-004、FR-005；NFR-001；AC-001、AC-003、AC-004。
  - **输入/命令：** 使用 Playwright Chromium 将依次表达 “Welcome to the meeting.” 和 “We will discuss the project.” 的 Azure Speech 合成 WAV 注入浏览器麦克风；点击“开始翻译”，记录音频帧进度、WebSocket 消息和字幕变化，在第二段语音播放中点及整段结束后分别读取字幕。
  - **预期结果：** 第二段语音仍在播放时，第一段对应且包含“欢迎/会议”语义的中文字幕已经可见；随后出现包含“讨论/项目”语义的第二段中文字幕，顺序与英语输入一致，不是整段结束后一次性批量出现。
  - **所需证据：** Playwright 记录的音频帧计数与第二段播放检查点、带时间的 `speech.final`/`subtitle.delta`/`subtitle.final` WebSocket 消息、两个可见字幕文本、浏览器控制台和失败网络请求摘要。

- [ ] **IQA-002** 自动检测英语并翻译为中文
  - **追溯：** INT-005、INT-008；US-002；FR-002、FR-003；AC-002。
  - **输入/命令：** 不进行任何语言选择，使用 Playwright 注入同一合成英语 WAV，检查页面控件、`speech.final.detectedLanguage`、可见检测语言、字幕事件的 `targetLanguage` 与字幕语义。
  - **预期结果：** 页面没有源语言选择控件，产品自动检测为英语，所有翻译事件目标语言均为 `zh-CN`，并呈现表达英语输入含义的中文字幕。
  - **所需证据：** 页面无 `select` 控件记录、英语输入说明、可见检测语言、WebSocket 检测语言及目标语言字段、对应中文字幕文本。

- [ ] **IQA-003** 已批准完整用户流程使用实际依赖
  - **追溯：** INT-004、INT-005、INT-006、INT-007、INT-008；US-001、US-002、US-003；FR-001、FR-002、FR-003、FR-004、FR-005；NFR-001；AC-001、AC-002、AC-003、AC-004。
  - **输入/命令：** 使用 Playwright 从点击开始、麦克风合成音频采集、二进制 WebSocket 上传、自动检测、Speech finalized、Foundry 流式翻译到页面字幕呈现执行一次完整黑盒流程，并在输入结束后点击“停止翻译”。
  - **预期结果：** 采集、请求、Speech 返回、Foundry 返回和字幕呈现检查点均完成；每个字幕片段存在非 `test-double:` 的 Speech result ID 与 Foundry request ID 关联证据，且完整流程同时满足 AC-001 至 AC-004。
  - **所需证据：** Playwright 完整流程记录、WebSocket 控制与二进制帧计数、实际 `dependency.evidence` 标识（不含凭据或正文）、可见字幕进展、停止状态、控制台及网络错误摘要。

## 结果判定

- 只有三个 IQA 场景全部通过、`defects` 与 `testGaps` 均为空时总体通过。
- 已开始执行场景后，已批准行为不成立记入 `defects`；脚本自身无法完成验证才记入 `testGaps`。
- 测试素材生成、浏览器启动、候选就绪或身份校验失败时不执行场景，返回空的 `defects`、`testGaps`、`scenarios` 和 `bugfixResults`，并在 `evidence` 中记录不含秘密的环境诊断。
