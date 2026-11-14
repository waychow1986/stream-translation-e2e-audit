# IQA-002 缺陷修复

## 修复信息

- **Bug ID：** IQA-002
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

Speech SDK 的区域 STT WSS origin 不在生产 CSP 中，双片段英文识别在 final 产生前被浏览器阻断，后续翻译和固定逻辑没有输入。

## 修复范围

仅受限放行 Azure Speech 区域 STT WSS 并增加安全 contract 覆盖；未修改翻译、reducer 或测试输入接口。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 增加 `wss://*.stt.speech.microsoft.com` CSP host-source | 恢复区域 Speech 识别连接 |
| `tests/contract/security.test.ts` | 增加允许目标与禁止宽泛授权的断言 | 防止区域目标再次遗漏或授权过宽 |

## 新增或修改的测试

聚焦 contract 测试覆盖自定义 Speech origin、区域 STT WSS 和最小授权边界。

## 执行命令与结果

- 聚焦测试修复前失败，修复后 2/2 通过。
- `npm run staticAnalysis`、`npm run build`、`npm run developerTests`、`npm run integrationTests` 最终通过。
- `npm run functionalTests` 在安装 Chromium 后 8/8 通过。

## 相对评估的偏差

无；未对无独立缺陷证据的 final 翻译和固定逻辑做改动。

## 剩余风险

真实双片段英文 final、完整译文原位替换、固定标识和第二片段不可变性仍需 Independent QA 复测。

## 修复结论

已完成 IQA-002 前置 CSP 根因修复，本地验证通过，真实功能证据延后至平台复测。
