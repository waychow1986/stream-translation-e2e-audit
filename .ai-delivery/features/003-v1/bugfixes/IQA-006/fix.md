# IQA-006 缺陷修复

## 修复信息

- **Bug ID：** IQA-006
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

Speech SDK 的区域 STT WebSocket 被生产 CSP 阻止，双片段中文场景没有识别 final，中文固定逻辑未被触发。

## 修复范围

仅调整 CSP 以受限允许实际 Azure Speech 区域 STT WSS，并增加对应 contract 覆盖；未修改中文固定逻辑。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 加入 `wss://*.stt.speech.microsoft.com` | 恢复中文 final 的上游连接 |
| `tests/contract/security.test.ts` | 断言实际目标且禁止宽泛 WSS | 覆盖遗漏并控制安全范围 |

## 新增或修改的测试

新增聚焦 CSP contract 回归；既有中文 reducer 和本地功能测试继续覆盖 final 固定及不调用翻译。

## 执行命令与结果

- 聚焦测试修复前失败，修复后 2/2 通过。
- staticAnalysis、build、developerTests 与 integrationTests 最终通过。
- 包含中文固定场景的 functionalTests 安装 Chromium 后 8/8 通过。

## 相对评估的偏差

无；没有修改当前证据不支持变更的中文 reducer。

## 剩余风险

真实双中文片段的 final 固定、首段 ID/文本不变和零翻译请求需在候选环境复测。

## 修复结论

已完成 IQA-006 前置 CSP 根因修复并通过本地确定性验证，真实行为等待 Independent QA 确认。
