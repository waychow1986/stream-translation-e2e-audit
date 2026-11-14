# IQA-001 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-001
- **QA Run ID：** 本次 Independent QA（未提供独立 Run ID）
- **Candidate SHA：** `7083a475b0626d45854acf935c12caa2f49a2421`
- **环境：** `http://20.7.107.68`

## 问题报告

英文会话启动并取得 Speech token 后，没有音频帧进入已建立的 Speech WebSocket，因而 final 前未形成或修订中文草稿。

## 预期与实际行为

依据 `FR-004`、`FR-005` 与 `AC-002`，英文稳定短语应在 final 前形成中文草稿，并随识别变化修订。实际 token HTTP 为 `200`、Speech WebSocket 为 1 个但帧数为 0，翻译请求与可见草稿变化均为 0。

## 复现步骤与证据

QA 在 `http://20.7.107.68` 启动会话并尝试播放由真实 Azure Speech TTS 合成的英文 RIFF/WAV。候选身份与健康检查正确，会话启动为 `true`，Speech token 为 `200`，无控制台错误或网络失败；但唯一 Speech WebSocket 全程 0 帧。该证据证明 CSP 修复后连接已建立，却没有证明合成音频已作为默认麦克风输入被浏览器实际采集。

## 影响追踪

影响 `US-001`、`US-002`、`FR-001`、`FR-004`、`FR-005`、`NFR-001`、`SC-001`、`AC-001`、`AC-002`、场景 `IQA-001`，以及任务 `T003`、`T009`、`T011`、`T012`、`T015`、`T019`。

## 根因分析

当前候选已允许区域 Speech WSS，运行证据也从上一轮“0 个 WebSocket”变为“1 个 WebSocket/0 帧”。`src/client/speech-adapter.ts` 使用产品规定的默认麦克风输入，且 WebSocket 已建立；其下游 recognition、翻译调度和 reducer 均因无音频帧而未执行。QA 证据只证明生成了 WAV，未证明 Playwright 浏览器以可采集的 fake media device、文件注入、麦克风权限及 HTTP 测试地址安全上下文配置启动。浏览器启动参数、媒体注入与输入有效性属于 QA 脚本可控条件，因此根因是测试夹具未完成端到端音频注入，而非产品代码缺陷。沿调用链未发现能够在无输入帧时单独导致本症状的产品缺陷。

## 限定范围的修复方案

仅修订 Independent QA 计划/脚本：在启动浏览器前验证合成 WAV 格式可被 Chromium fake audio capture 接受；显式配置 fake media device、音频文件、麦克风权限，并对该 HTTP 候选地址配置测试所需安全上下文；开始场景后先断言 Speech WebSocket 出现非零音频帧，再判定草稿行为。不得修改产品代码或增加测试专用产品接口。

## 回归风险

若只等待更久而不验证帧，会重复把无输入误报为字幕失败；若使用协议 fake adapter，则会失去真实 Azure 端到端证据。QA 修订后仍需验证真实 Speech interim、真实 Foundry 草稿及草稿修订。

## 未解决证据

尚无非零音频帧、Speech interim、翻译请求或草稿时序证据，因此不能判定产品行为通过；QA 修订后必须重跑本场景。若确认非零帧后仍无 interim，再以新的真实调用链证据另行评估产品或 Azure 依赖。

## 分类与修复就绪决策

- **classification：** `test_gap`
- **ready_for_fix：** `true`
- **决策依据：** 失败停在 QA 可控制的浏览器媒体注入边界；修订目标明确且无需产品改动，可以交回 QA 计划修复。
