# IQA-004 缺陷修复

## 修复信息

- **Bug ID：** IQA-004
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

区域 Speech WSS 不在 CSP `connect-src`，识别链在字幕状态产生前终止，固定视窗没有收到可追加片段。

## 修复范围

仅修改 Speech CSP 白名单及其 contract 测试；未修改固定视窗、字幕 reducer 或 QA 接口。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 受限允许 Azure Speech 区域 STT WebSocket | 恢复固定字幕的上游识别输入 |
| `tests/contract/security.test.ts` | 覆盖区域连接及最小授权 | 防止连接回归和安全范围扩大 |

## 新增或修改的测试

新增 CSP 聚焦 contract 回归；既有 Playwright 固定视窗测试继续验证本地协议输入下的追加和跟随。

## 执行命令与结果

- 聚焦测试修复前失败，修复后 2/2 通过。
- staticAnalysis、build、developerTests 和 integrationTests 最终通过。
- 包含固定视窗场景的 functionalTests 安装 Chromium 后 8/8 通过。

## 相对评估的偏差

无；未在缺少独立证据时改动视窗实现。

## 剩余风险

真实多片段输入下的片段 ID、append-only 顺序、固定高度及自动跟随仍需 Independent QA 复测。

## 修复结论

已完成 IQA-004 上游 CSP 根因修复，本地视窗回归通过，真实部署证据待平台产生。
