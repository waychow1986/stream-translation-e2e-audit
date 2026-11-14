# IQA-006 缺陷评估

## 缺陷信息

- **Bug ID：** IQA-006
- **QA Run ID：** 本次 Independent QA（关联 `NR-DLV-20261113-BCCA3652FB86-0039`，未提供独立 Run ID）
- **Candidate SHA：** `8f23a795b014acf174497f1c11b5641f1de2739c`
- **环境：** `http://20.7.107.68`

## 问题报告

双片段中文输入没有产生固定中文片段，无法验证首段完整原文最终固定并抵抗后续片段改写。

## 预期与实际行为

预期首个中文片段 final 后固定完整原文，第二片段不改写首段，且始终不调用翻译。实际 Speech WebSocket/帧、固定中文片段和翻译请求均为 0。

## 复现步骤与证据

在候选环境授权媒体并播放双片段中文合成音频。会话和 token `200` 成功，控制台指向区域 Speech WSS 连接；没有 WebSocket 或识别 final，因而固定片段为 0。翻译请求为 0 不能单独证明中文路由正确。

## 影响追踪

影响 `US-003`、`FR-008`、`FR-011`、`SC-006`、`AC-004`、`AC-009`、场景 `IQA-006`，以及任务 `T004`、`T011`、`T012`、`T020`—`T023`、`T025`。

## 根因分析

生产 CSP 的 Speech `connect-src` 仅包含配置 endpoint 的 origin，而 SDK 实际使用区域 STT WSS origin，导致浏览器在识别前阻断连接；现有安全 contract 测试未覆盖该差异。中文 final reducer 与后续片段不可变逻辑完全未被触发，因此当前证据只支持共享的 CSP 产品缺陷，不支持另行修改中文固定逻辑。

## 限定范围的修复方案

仅调整 CSP 以受限允许 SDK 的实际 Azure Speech WSS 目标并增加 contract 覆盖。恢复后用既有双中文片段场景验证 final 固定、首段 ID/文本不变和零翻译请求。

## 回归风险

需控制 CSP 域范围并保证跨区域工作。真实回归还需防止中文 final 被重复固定、后续 interim 命中旧 segment，或意外调用 Foundry。

## 未解决证据

中文 final 与第二片段事件尚未到达产品状态机；修复后必须重跑，排查被前置阻塞掩盖的固定或不可变性缺陷。

## 分类与修复就绪决策

- **classification：** `product_defect`
- **ready_for_fix：** `true`
- **决策依据：** 运行证据与 CSP 实现直接对应，且该连接规则由产品控制；QA 已具备媒体、权限和真实 Speech token。
