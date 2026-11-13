# 实时中文字幕：Azure STT + GPT mini

独立的 JavaScript / Node.js 浏览器应用，使用微软官方 Speech SDK 和 OpenAI JavaScript SDK。
默认英中连续语言识别；稳定英文短语提前交给 `gpt-5.4-mini` 翻译，不再等待整句识别确认。
同一段只显示一份可修订草稿，识别及完整翻译确认后才固定；中文直接显示识别原文，不调用模型。
UI 沿用微软官方浏览器示例的白底、表格配置、Original / Results / Events 风格。
已有的 `语音翻译\python版本` 和 `语音翻译\web版本` 不依赖本项目，也未被修改。

## 启动

1. 安装 Node.js 22 或更新版本；本机已使用 Node.js 24 验证。
2. 双击本目录的 **`start.cmd`**。
3. 浏览器打开 **http://127.0.0.1:5174**。选择会议收音设备，点击 **Start / 开始**，允许麦克风访问。
4. 建议使用最新 Edge / Chrome，并在正式会议前测试实际话筒、音响回授、网络和配额。

也可在 PowerShell 中运行：

```powershell
Set-Location -LiteralPath 'C:\Users\weizhou5\Documents\Accounts\诺和诺德\语音实时翻译\STT&小模型'
npm start
```

关闭启动窗口或按 Ctrl+C 停止本机服务。正常使用不需要 Python；Python 仅用于开发验证。
本机服务只监听 `127.0.0.1`，不是可直接部署到公网的多用户服务。
端口冲突时，可在 `config.json` 修改 `port`，重启后使用启动窗口显示的地址。

## 字幕行为

- **稳定短语提前上屏：** 比较连续两次识别的共同词前缀，并保留最新一个词不提前处理；达到可用短语边界后开始翻译。Original 仍显示完整的实时识别草稿。
- **一个片段，一份草稿：** 同一识别片段始终使用同一个字幕节点。未确认内容可以调整早期词语和中文语序，不再提前锁定为正文，也不再保留旧稿并另附“更正译文”。已确认的历史字幕不改写、不删除。
- **更新不清屏：** 第一份草稿流式追加。后续译文在后台完整生成并通过流完整性校验后，再一次替换当前草稿；生成期间保留原稿，不逐 token 重刷替换稿。早期词语修订会等待稳定源文覆盖已显示范围，避免草稿先突然缩短再长回。可修订范围是当前未确认片段，可能跨多行，不再限制为末行或 22 个字符；更短的最终识别仍可以替换旧草稿。
- **不是每来一个词就重译：** 首次使用较短稳定短语；有草稿后，仅对当前片段的累计稳定原文更新，通常至少新增 4 个英文词元或 8 个汉字才发起下一次请求。源文改词、语言改变和最终识别不受增长门槛限制。始终串行处理翻译，进行中的有效请求不会仅因原文增长而取消，等待期间只合并到最新稳定快照，不逐个积压所有中间版本。
- **过时请求不能回写：** 若正在翻译的源文已被识别修订，则取消该请求。取消后、完成后及新版本生成后的迟到回调均不能修改字幕；完整的新版本仍在同一草稿节点显示。
- **完整确认后再固定：** 最终识别到来后，使用完整当前源文对应的成功译文；仅当同样的源文和语言已有完整成功结果时才复用。不会仅拼接几个早期碎片就当成最终字幕。此时固定该段，并将其加入 Results 和导出。
- **固定字幕视窗：** 新内容在下方追加，靠近底部时自动跟随；手动向上查看历史字幕时，不会被强行拉回底部。不会因每次生成内容而撑高整个页面。
- **确认与未完成内容：** 只有 ASR 确认且翻译成功完成的片段加入 Results 和导出。取消或出错时，已显示文字原位保留，标注“未完成，未计入导出”。停止后若只有中间识别，会保留其暂定译文并明确标注，不伪装成 ASR 确认结果。
- **中文原文直显：** 稳定中文短语不经模型；最终识别在同一草稿节点补回完整原文和标点，之后固定。语言识别修订也不会另外生成重复段落。
- **Stop / 停止并完成尾句：** 停止话筒，接收已输入语音的尾部识别结果，再等待尾句翻译，最多等待 30 秒。
- **取消待译：** 停止话筒并取消剩余模型请求，只保留已确认字幕。停止过程中也可以点击取消。
- **导出确认字幕：** 下载带时间戳的 UTF-8 文本，不含生成未完成的内容。Original 保留识别原文，可手动复制排查未译内容。
- 提供字幕全屏、字号调整、清空和话筒选择。仅字号保存在 localStorage，字幕、原文、密钥和令牌均不写入 localStorage。

“确认”仅表示识别分段和模型请求已完成，不表示通过医学审核，也不保证翻译正确。
正在生成的片段尚未完成，不能作为最终结论。
显示方式借鉴最早 Speech Translation 版本的“临时结果可更新、最终结果固定”，但仍使用 STT + mini，
并保留本项目可滚动的确认字幕历史。不是切换翻译服务，也不承诺与 Speech Translation 具有相同延迟或准确性。
本版本提前显示稳定短语，并以稳定增长和原子替换控制更新；未确认字幕仍可能变化，不能同时承诺“完全不动”和吸收后续识别修订。
不保证固定几秒上屏，更不承诺 1–2 秒。
识别、短语稳定和模型仍各自需要时间；长药名、未说完的数字或否定结构可能需要等待更多上下文。
短语边界保护是启发式规则，不是完备的句法解析器，尚需客户医药语料验证。
一次识别片段可能触发多个模型请求，累计源文也可能重复发送；费用和输入 token 需求高于旧的“每个确认片段只译一次”模式。
只更新当前未确认识别片段，不重译整场会议；单次源文仍限制为 4000 字符，超限明确报错而不是静默截断。
中途停止一句话会得到未说完的译文，程序不会擅自补齐缺失的研究结论或数字。
尤其不要在药名、剂量或数字未说完时点击停止：例如 `three hundred and sixty` 被截断时，
Speech 可能只确认 `300`，系统无法可靠补回 `360`。请等待数字说完整并自然停顿后再停止。
即使主动停止后返回 ASR final，也可能只识别到数字而没有其后单位或名词；这类截断测试只能验证尾句处理，不能当作完整语义或医学准确性通过。

默认候选语言为 `en-US, zh-CN`。多候选启用 Continuous Language ID；
单候选固定识别该语言。语言检测限定在候选范围内，不等于任意语言自动检测，也不是逐词混合语言识别。
额外语言需要确认 Speech 支持并重新实测。
使用官方 Detailed 识别输出中的 `NBest[0].Lexical` 对齐英文草稿，
避免最终显示文本把 `three hundred and sixty` 改为 `360` 时误判为源文改词并取消有效请求；Original 保留最终显示文本。

## 接入客户医药术语

编辑根目录 **`medical-glossary.json`**，保存为 UTF-8 JSON。当前交付文件是空词表，未把演示词条当成客户批准译法。
下面仅为格式示例，正式使用前应由客户确认译法：

```json
{
  "version": 1,
  "terms": [
    {
      "source": "HbA1c",
      "target": "糖化血红蛋白（HbA1c）",
      "aliases": ["glycated hemoglobin", "hemoglobin A1c"],
      "note": "保留标准缩写 HbA1c。"
    },
    {
      "source": "investigational product",
      "target": "试验用药",
      "aliases": [],
      "note": "按本项目批准译法使用；具体产品名称另设词条。"
    }
  ]
}
```

| 字段 | 用途 |
|---|---|
| `version` | 当前必须为数字 `1` |
| `terms` | 词条数组；初始为 `[]` |
| `source` | 原文术语，必填，1–250 字符 |
| `target` | 批准的译法，必填，1–250 字符 |
| `aliases` | 可选，同一术语的写法或别名，最多 12 项 |
| `note` | 可选的语境说明，最多 500 字符；作为参考数据，不是模型指令 |

程序实际读取词表，将**当前片段匹配到的词条**随请求发送给模型，而不是仅引用文件名。
英文匹配不区分大小写，检查词边界，支持别名；不进行可能混淆药名的模糊匹配。
每请求最多 40 个匹配词条、词表最多 20000 条和 8 MB；超过限制会明确报错，不静默丢掉客户词条。
冲突译法、未知字段或损坏的 JSON 都会报错，不退回旧词表或空词表。

文件修改后，下一个翻译请求自动检查并加载更新；页面的 **刷新术语表** 用于校验及更新条数显示。
无需训练、构建或重新部署模型。不要在写入一半时用于正式会议，建议先保存完整文件再启动。
词表只参与**文本翻译**，并没有训练或定制 Speech 识别模型；已经听错的药名仍须结合原文、音频和场景核查。
检测为中文时直接显示识别原文，不通过模型改写或术语归一化。

## 配置与密钥

`config.json` 包含非秘密参数：

- Speech 根地址：`https://foundrysoutheastasia.cognitiveservices.azure.com/`
- Speech 区域：`southeastasia`
- Responses 地址：`https://foundrysoutheastasia.services.ai.azure.com/openai/v1/responses`
- 实际部署名称：`gpt-5.4-mini`

后端使用完整 Responses 地址推导 SDK `baseURL`，不会重复拼接 `/responses`。
每次请求显式设置：

```javascript
{
  model: "gpt-5.4-mini",
  reasoning: { effort: "none" },
  stream: true,
  store: false,
  max_output_tokens: 4096
}
```

只提供当前片段、最多三个短前文和匹配术语；前文仅用于指代，不重复翻译。
提示词要求保留数字、单位、否定、不确定性和因果边界，不总结、不补医学结论。
`maxRetries: 0` 避免实时字幕因自动重试不断积压；模型连接超时为 20 秒。
断流、拒绝、截断、空输出和授权/配额错误不会被当成成功确认，页面会显示错误并停止识别。
未译原文仍在 Original 中；不会用英文原文冒充中文字幕或静默跳过失败片段。
数值、缩写或词表明确要求保留的原文允许原样输出，并明确标注。

永久密钥仅保存在本机后端。当前 Windows 用户的加密文件是：
**`.local\foundry-key.dpapi`**，采用 Windows CurrentUser DPAPI。
浏览器只获得 Speech 短期令牌；每次有效期按 9 分钟保守计算，提前一分钟续期并更新现有 recognizer。
更换密钥请使用遮罩输入：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\set-key.ps1"
```

输入完成后重启本机服务。不要把密钥写入配置、源码、网址或聊天。
`read-key.ps1` 仅供后端私有子进程管道读取，不要单独运行或重定向到日志。
也可由受控运行环境注入 `AZURE_FOUNDRY_KEY`；程序不自动读取 `.env` 文件。
DPAPI 文件不能直接给另一 Windows 用户解密；复制项目或换电脑时应重新输入密钥。
曾在聊天中提供过的密钥建议由资源管理员轮换，本程序未自动轮换任何 Azure 密钥。

## 数据边界

音频发送到 Azure Speech；识别文本、必要前文和匹配术语发送到 Azure 模型。
本应用不保存录音，也不自动将会议内容写入磁盘；仅用户主动导出字幕。
开发验证报告包含的都是明确标注的虚构合成数据。
`store:false` 控制 Responses 的状态存储，不等于整个 Azure 服务完全不留日志或不受其数据处理政策约束。

当前部署为 **GlobalStandard**，不能因为资源地址在东南亚就保证模型推理固定在东南亚。
正式处理客户、临床或受监管资料前，须确认客户授权、Azure 数据处理/滥用监控政策、数据驻留及组织合规要求。
医学字幕必须人工复核，特别是药名、剂量、否定、不良事件和研究结论；不替代临床判断。

## 验证与复现

```powershell
npm test
node scripts\check-source.mjs
```

Node 测试覆盖词表校验/更新、提示与参数、真实 SDK 配置、流式完成状态、稳定短语提前翻译、
数字及否定边界、单草稿改词、早期词语及中文语序修订、原子替换成功/失败、词法/显示文本对齐、
累计更新合并、过时请求取消、完整源文确认、确认历史不变、中文直显及最终标点、
停止、取消缓冲修订、确认后迟到回调、超时与积压、令牌续期、本机路由及请求并发限制。
`check-source.mjs` 检查配置资源的实际永久密钥未出现在项目源码中，不输出密钥。

可选浏览器验证需要 Python、Playwright 和已安装的 Edge；不属于应用运行依赖。
先在另一启动窗口运行 `npm start`：

```powershell
python tests\browser_checks.py --mode mock
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\make-test-audio.ps1
python tests\browser_checks.py --mode azure --audio .local\synthetic-test.wav
python tests\browser_checks.py --mode azure-tail --audio .local\synthetic-test.wav
python tests\browser_checks.py --mode azure-cancel --audio .local\synthetic-test.wav
node scripts\azure-check.mjs
```

也可使用完整英文原稿进行分层诊断。先将**获授权的测试原稿**另存为 UTF-8 文本，例如 `.local\reference.txt`：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\make-test-audio.ps1 -SourceScript .local\reference.txt -Path .local\full-script.wav
python tests\browser_checks.py --mode full-script --source-script .local\reference.txt --audio .local\full-script.wav
```

该模式使用相同模型参数，先逐段直接翻译原稿，再测试明确标记的人工错词/分段对照，
最后通过真实浏览器 STT + mini 处理完整合成语音。不会修改正常应用的识别、字幕或翻译逻辑。
与普通使用不同，**诊断会把原稿、STT 最终结果、实际模型输入和译文写入本机报告**；
只应用于获授权的测试材料。报告为 `.local\browser-tests\draft-full-script-browser-validation.json`，
过程中还会保存 `draft-full-script-progress.json`，便于失败后排查。
人工替换与强制分段对照不代表 STT 实际发生过这些错误；合成语音也不能代替原始录音，
简单词差异与关键词检查不能当作医学准确率。
成功退出仅表示诊断流程及字幕状态断言通过，不表示译文质量通过；须检查报告中的异常文字和完整源文/译文。

真实 Azure 验证会产生少量 Speech / 模型费用，使用虚拟麦克风播放合成语音，不录制现场声音。
音频生成脚本使用 Windows 的 Microsoft Zira Desktop / Microsoft Huihui Desktop 语音。
测试报告和截图保存在 **`.local\browser-tests`**。当前单草稿模式使用 **`draft-`** 前缀；
`phrase-` 属于旧的仅末行/22 字符可修订模式，`stable-` 属于旧的整段确认后追加模式，
更早未带前缀的浏览器验收报告属于旧预览模式。
不同模式的数据不能混用。合成 WAV 测试完成后可删除；本次交付已清理。

已验证的范围是虚构英中语音、数字/否定关系样例、测试术语、停止尾句、取消和浏览器交互。
这不是医药准确率基准，也不是与原 Speech Translation 版本在同一数据集上的 A/B 性能结论。
页面的“模型首字耗时”从服务端发出模型请求开始计算，**不含语音识别**；
当前浏览器报告以实际检测到的声音起点为准，另外保留点击 Start 的时间用于排查启动开销。
“有意义中文”在本次合成样例中指包含首句“研究”这一实义词的字幕，不用最先两个汉字冒充完整短语。

本机单草稿模式验收记录：

| 项目 | 结果 |
|---|---|
| Node 自动化回归 | 54 项通过 |
| 浏览器场景检查 | 17 项原有交互回归、13 项草稿与修订检查通过 |
| 实际浏览器 → Azure → 模型 | 36.61 秒合成英中语音，6 段确认字幕，英中语言均检测成功 |
| 实际开口 → 首段有意义中文 | 两次为 4.985 秒、4.971 秒；包含识别、短语稳定、模型、网络和上屏，尚未达到 1–2 秒 |
| 首句 ASR 确认时刻 | 两次为开口后 7.092 秒、7.086 秒；有意义中文均早于整句确认 |
| 点击 Start → 首次看到中文 | 两次为 8.153 秒、7.249 秒，包含静音和设备/连接启动；不能与“开口起算”混为一谈 |
| 主字幕版本与稳定性 | 两次均为 6 个确认片段、6 个字幕节点，0 个重复更正段或更正标签；各有 3 次合法草稿改写，0 次确认历史改写、节点删除、多草稿并存或清空 |
| 模型请求次数 | 两次均为 9 次；验证全部 4 个英文最终源文均有对应完整翻译请求，2 个中文片段不调用模型 |
| 数字与否定 | 样例的 360、12、英文不确定因果边界、中文“不能把初步结果当作最终结论”保留；词表校验和映射继续由自动化测试覆盖，客户表仍为空 |
| 停止、取消及凭据边界 | 真实提前停止保留被截断尾句；取消无迟到覆盖，话筒释放；两轮完整测试的实际请求/API 响应/DOM/storage 无永久密钥 |

这些是特定合成样例的一次验收结果，不能当成真实会议的延迟承诺、医学准确率或比旧方案更好的证据。
两轮完整报告为 `draft-azure-run1.json` 和 `draft-azure-browser-validation.json`；
`draft-mock-browser-validation.json` 记录同一节点的长草稿改词、缓冲替换、过时请求取消和导出检查。
历史 `phrase-` 报告中的 4.654 / 4.824 秒属于上一个短尾部模式，不能替代当前验收结果，也不是本次严格 A/B 对照。

### 完整英文稿分层诊断

使用同一份 8 段、371 词（按空白分词）的虚构英文原稿，先逐段直接调用 mini，
再通过真实浏览器 Speech + mini 处理完整合成语音。两轮均未修改生产识别、字幕或翻译代码，三个核心文件的 SHA256 与报告一致。

| 音频条件 | 时长 | ASR 确认片段 | 实时模型请求 |
|---|---|---|---|
| Zira 自然停顿 | 165.255 秒 | 21 段 | 79 次，全部完成 |
| 内部静音缩至 200 ms | 152.895 秒 | 6 段 | 74 次，73 次完成、1 次取消 |

第二轮只缩短 21 处内部精确零 PCM 静音，保留头尾静音及全部非零发音样本，未改变原稿、语速或服务参数。
这是分段条件对照，不是用户原始录音，也不是只改变 mini 输入的模型 A/B 测试。

- **模型混语已复现：** 含 `should not be presented as final conclusions` 的正确原稿共重复 6 次，其中 2 次输出天城文 `प्रस्तुत`。短停顿语音的 3 次实时草稿请求也含该词，最终确认稿未保留。当前校验只检查是否有汉字，未拦截中文中的其他文字；不是 STT 错词才能触发的问题，也不能用这几个样本估算实际错误率。
- **STT 也有实测错词：** 自然停顿仅出现 `HbA1c` / `hba one c` 的表达差异；短停顿则出现 `findings` → `things`，并漏掉后一句 `An adverse event` 中的 `adverse`。另有 `sixth` → `six` 的数字表达变化，不能把所有词差异都算成医学识别错误。
- **跨段会改变语义关系：** 短停顿实测把 `Friday` 与 `November sixth` 分到相邻确认片段，译文先结束“星期五前提交”，下一段变成“11月6日，我们随后将……举行……审查”，日期不再清晰地修饰提交截止时间。人工在 `discontinuations` 后断开，也复现了后段 `due to tolerability concerns` 无法自然回接前段停药的情况。
- **标点预处理会放大风险：** 当前英文 final 使用 Lexical 文本，仅补回末尾标点，内部句界不传给模型。人工对照保留所有英文词但移除内部句号后，得到“由于耐受性方面的担忧，研究期间发生的一个不良事件……”，把本应修饰前段停药的原因接到了下一句。这是人工边界/标点对照，不是声称真实语音恰好在相同位置切段。
- **未自然复现的错词不归因：** 两轮真实 STT 和正确原稿翻译均未出现“研究领域”或“资源中心”；只有人工把 `figures` 改成 `fields`、把 `research` 改成 `resource` 后才复现。不能据此断言用户上次的这两个错误来自 STT。
- **结尾覆盖：** 两轮最终译文均保留感谢、开放提问，以及研究终点、安全性评估、拟议时间表；这不代表全文没有其他错译或漏词。

自然停顿报告为 `.local\browser-tests\draft-full-script-natural-pauses.json`，
短停顿报告为 `draft-full-script-short-pauses.json`，当前默认完整稿报告也保留第二轮结果。
`full-script-pause-variant.json` 记录静音处理及发音样本校验，`full-script-diagnostic-summary.json` 汇总分层证据。
以上问题尚未在生产代码中修复；本轮新增的是诊断及复现，不是翻译质量修复验收。

随后已用 SHA256 一致的两份音频补测方案一 Speech Translation：首句“下午好”分别为
3.311 / 2.994 秒，本方案对应为 4.970 / 4.667 秒。方案一未检出混语，但短停顿版也漏掉
`statistical`，并拆坏“不一定由研究用产品引起”的否定/因果句，不能直接判定其整体准确率更高。
两者部署区域及分段配置不同；具体证据见
`..\语音翻译\web版本\.local\browser-tests\speech-translation-full-script-comparison.json`。

### 低延迟排查：1–2 秒目标尚未达到

另用虚构合成语音测量了实际声音出现后的时间：通过 Web Audio 每 8 毫秒采样，
以 RMS 超过 0.003 的首次非静音作为起点，不使用点击 Start 的时间，也不直接减去预设静音长度。
以下识别和语音翻译各测两次，模型子链路测六次：

| 测量对象 | 本次观察 |
|---|---|
| 英中自动识别：开口至首批中间原文 | 2.20–2.41 秒 |
| 英中自动识别：开口至 `this fictional clinical study` 四词短语 | 2.30–2.51 秒 |
| mini：请求发出至至少两个汉字 | 0.80–1.71 秒；不含识别，也不代表完整、有意义的中文字幕 |
| 直接 Speech Translation，英中自动识别：开口至包含“研究”的中文短语 | 2.44–3.07 秒 |
| 直接 Speech Translation，固定英文：开口至包含“研究”的中文短语 | 2.49–2.87 秒 |

开口起算的指标包含讲者说出相应词语所需的时间，不是服务端纯计算耗时。
模型测试交替使用两个输出 token 上限，且连接逐渐变暖，不是隔离变量的 A/B 测试，
不能据此断言较小上限一定更快。识别测试仅将翻译响应替换为测试数据以隔离识别时间；
两组直接 Speech Translation 测试则使用真实 Azure 返回的中文。

这些少量样本不能作为准确率、延迟保证或不同服务的严格性能排名。
尤其不能将模型首字耗时称为端到端延迟，或将分开测量的耗时相加后称为已实测的字幕性能。
诊断报告分别为 `.local\browser-tests` 中的 `asr-latency-profile.json`、
`mini-latency-profile.json`、`speech-translation-latency-profile.json` 和
`fixed-english-translation-latency-profile.json`。
上表是方案调整前的少量分项诊断数据，不是当前源码的分项性能保证。
当前已实现上文的单草稿及最终确认模式，仍使用 STT + mini，并未自动切换为 Speech Translation。
当前端到端结果以“本机验收记录”中的实际声音起算数据为准。

### 与 Teams 字幕策略的关系

Teams 官方 FAQ 确认其翻译字幕使用 Azure Cognitive Services 支持的 Microsoft Speech Translation 技术，
但没有公开具体模型版本、稳定阈值或锁定窗口，不能把本项目或某个 SDK 配置等同于 Teams 内部实现。
Azure 官方字幕文档说明了中间识别、最终识别及稳定中间结果之间的取舍；
`SpeechServiceResponse_StablePartialResultThreshold` 越高通常越稳定，也可能增加延迟。
当前项目在前端比较稳定前缀，未额外设置该服务端阈值；后续应分别测试，避免重复增加稳定等待。

## 官方资料

- [微软 Speech SDK 浏览器示例](https://github.com/Azure-Samples/cognitive-services-speech-sdk/tree/master/samples/js/browser)
- [Speech 语言识别](https://learn.microsoft.com/azure/ai-services/speech-service/language-identification)
- [Azure 实时字幕与稳定中间结果](https://learn.microsoft.com/azure/ai-services/speech-service/captioning-concepts)
- [Teams 实时字幕及翻译技术 FAQ](https://support.microsoft.com/en-us/teams/meetings/use-live-captions-in-microsoft-teams-meetings)
- [Azure OpenAI Responses API](https://learn.microsoft.com/azure/foundry/openai/how-to/responses)
- [OpenAI 官方 JavaScript SDK](https://github.com/openai/openai-node)

第三方来源和许可见 `THIRD_PARTY_NOTICES.md` 及安装包自身的许可证。
