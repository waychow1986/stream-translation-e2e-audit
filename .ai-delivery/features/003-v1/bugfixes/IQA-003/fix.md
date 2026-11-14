# IQA-003 缺陷修复

## 修复信息

- **Bug ID：** IQA-003
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

生产 CSP 未允许 Speech SDK 的区域 STT WebSocket，中文识别在音频发送前中止，中文 interim 与直显路径未执行。

## 修复范围

仅校正 Speech 区域 WSS 的受限 CSP 允许规则并增加 contract 回归；未修改中文路由或增加测试专用入口。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 添加区域 STT WSS host-source | 允许中文识别到达现有路由 |
| `tests/contract/security.test.ts` | 验证目标和授权边界 | 捕获真实 SDK 连接形态 |

## 新增或修改的测试

聚焦测试断言 CSP 精确允许 `wss://*.stt.speech.microsoft.com`，且不允许任意 WSS 或整个 Speech 域。

## 执行命令与结果

- 聚焦测试修复前失败，修复后 2/2 通过。
- 静态分析、构建、developerTests（23/23）和 integrationTests（9/9）最终通过。
- functionalTests 安装 Chromium 后 8/8 通过。

## 相对评估的偏差

无；没有修改当前证据未指向的中文 reducer 与翻译绕过逻辑。

## 剩余风险

真实中文 interim 多次变化、原文一致性及 `/api/translations` 零调用需在候选部署后复测。

## 修复结论

已移除 IQA-003 的 CSP 前置阻塞并通过本地确定性验证，等待 Independent QA 真实服务复测。
