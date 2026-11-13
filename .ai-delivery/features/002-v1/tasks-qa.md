# 实时流式翻译 Independent QA 计划

## 执行边界

执行脚本先读取平台提供的 QA 标识与地址，在五分钟内重试 DNS、TLS、健康检查和 `/candidate-identity`，并确认返回的 `deliveryId`、`candidateSha` 与平台输入一致。随后使用锁定版本的 Azure Speech SDK、平台 OIDC token、Speech endpoint 与完整 ARM resource ID 合成含两个可区分语义片段及中间停顿的英语 WAV，不自行拼接 TTS REST 路径；再以 Playwright、Chromium fake microphone、`getUserMedia` 和 AudioWorklet 对部署候选执行一次黑盒完整流程。健康与身份检查只用于候选就绪判定，不作为功能验收证据。

脚本不访问仓库 fixture，不修改工作区；临时音频仅写入系统临时目录，最终只向 `QA_RESULT_PATH` 写入一个 JSON 结果。首次 QA 不执行 Bugfix 复测，`bugfixResults` 为空数组。

## 验收任务

- [ ] IQA-001 英语发言期间持续出现中文字幕
  - **追溯：** INT-001、INT-002、INT-003、INT-004、INT-006；US-001、US-003；FR-001、FR-004、FR-005；NFR-001；AC-001、AC-003、AC-004。
  - **输入/命令：** 通过 Azure Speech SDK 使用平台 OIDC token、Speech endpoint 与完整 ARM resource ID 合成依次表达“项目计划”和“2027 年预算”的英语 WAV；用 Playwright 启动 Chromium fake microphone，点击“开始翻译”，记录浏览器送入的 16 kHz PCM 样本进度、可见字幕变化和 WebSocket 事件，待两个片段完成后点击“停止翻译”。
  - **预期结果：** 第二个语义片段仍在输入时，第一个片段对应的中文字幕已经可见；最终至少两个字幕按输入顺序呈现，并分别表达“项目计划”和“2027 年预算”的含义。
  - **所需证据：** 第一条字幕出现时及第二段语音输入期间的 PCM 样本位置、字幕文本与变化顺序，以及停止边界前后的 Playwright 黑盒观察记录。

- [ ] IQA-002 自动检测英语并翻译为中文
  - **追溯：** INT-005、INT-008；US-002；FR-002、FR-003；AC-002。
  - **输入/命令：** 不执行任何语言选择，使用 Playwright 将同一合成英语 WAV 经浏览器麦克风链路输入候选，检查页面控件、检测语言、WebSocket 字幕目标语言和可见字幕。
  - **预期结果：** 页面不存在要求用户选择源语言的控件，候选自动检测到主标签为 `en` 的英语，全部字幕事件的目标语言为 `zh-CN`，可见结果包含中文并表达输入含义。
  - **所需证据：** 无语言选择控件的页面检查、`speech.final.detectedLanguage`、`subtitle.final.targetLanguage` 以及对应可见中文字幕的 Playwright 记录。

- [ ] IQA-003 已批准完整用户流程使用实际依赖
  - **追溯：** INT-004、INT-005、INT-006、INT-007、INT-008；US-001、US-002、US-003；FR-001、FR-002、FR-003、FR-004、FR-005；NFR-001；AC-001、AC-002、AC-003、AC-004；SC-004。
  - **输入/命令：** 使用 Playwright 从浏览器开始采集合成英语语音，完成自动检测、流式转写、流式中文翻译和字幕呈现；截取同一会话中的 `speech.final`、`subtitle.final` 与 `dependency.evidence` 事件进行逐片段关联。
  - **预期结果：** 完整流程满足 AC-001 至 AC-004；每个通过的字幕片段都有同 `segmentId` 的非空 Speech result ID 与 Foundry request ID，且均不含 `test-double:`，页面加载、Mock 或局部成功不能构成通过。
  - **所需证据：** 同一次 Playwright 执行中的输入进度、检测语言、字幕流、最终语义结果及按 `segmentId` 关联的非测试替身依赖标识；记录不得包含 token 或凭据。
