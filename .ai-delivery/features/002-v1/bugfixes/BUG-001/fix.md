# BUG-001 缺陷修复

## 修复信息

- **Bug ID：** BUG-001
- **Repair Batch ID：** RB-NR-DLV-20261113-96F0EE0F92F9-0056
- **评估结论：** `ready_for_fix: true`

## 已确认根因

1. Azure Foundry adapter 调用 `AIProjectClient.getAzureOpenAIClient()` 时未传入 SDK 所需的 API version，在部署环境未提供未声明的 `OPENAI_API_VERSION` 时抛错并导致 `session.failed/MODEL_UNAVAILABLE`。
2. 客户端在 `capture.start()` 完成前显示“正在聆听”，且未处理麦克风不可用或权限拒绝，造成 UI 状态错误且连接与采集资源未明确收束。

QA 浏览器安全来源、权限和 fake media 配置缺口不属于本次产品代码修复。

## 修复范围

- 创建 Foundry OpenAI client 时固定传入评估批准的 `apiVersion: "2025-04-01-preview"`，不新增环境变量或改变模型与协议。
- 仅在麦克风启动分支捕获失败；失败时幂等停止采集、关闭当前 WebSocket、避免进入“正在聆听”并显示“麦克风启动失败”。
- 增加真实 adapter 创建参数 contract test，以及麦克风不可用和权限拒绝的定向单元测试。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/adapters/azure-foundry.ts` | 显式传入批准的 Foundry API version | Foundry client 创建缺少 API version |
| `src/client/translation-client.ts` | 麦克风启动成功后才进入聆听；失败时清理、断连并呈现失败状态 | 麦克风失败未处理且状态过早切换 |
| `tests/contract/azure-foundry.contract.test.ts` | 新增 OpenAI client 参数 contract 覆盖 | 原 contract test 未覆盖真实 adapter 边界 |
| `tests/unit/resource-cleanup.test.ts` | 新增麦克风不可用与权限拒绝回归覆盖 | 原测试未覆盖采集启动失败 |

## 新增或修改的测试

- 新增 Azure Foundry adapter contract test，断言 `getAzureOpenAIClient` 精确接收 `2025-04-01-preview`。
- 扩展客户端资源清理单元测试，分别模拟 `getUserMedia` 不可用和 `NotAllowedError`，断言采集停止一次、WebSocket 关闭一次、状态不出现“正在聆听”且呈现“麦克风启动失败”。
- 运行既有全部 unit、contract 和本地 Playwright 功能测试，验证成功采集、停止、字幕与反向判定流程未回归。

## 执行命令与结果

- `npx vitest run --root . tests/contract/azure-foundry.contract.test.ts tests/unit/resource-cleanup.test.ts`：修复前 3 个新增断言失败；修复后 2 个测试文件、6 个测试全部通过。
- `npm run typecheck`：通过，退出码 0。
- `npm test`：通过；unit 4 个文件、9 个测试，contract 10 个文件、21 个测试全部通过。
- `npm run build`：客户端与服务端生产构建通过，退出码 0。
- `npx playwright install chromium && bash .ai-delivery/features/002-v1/runtime/developer-functional-run.sh`：10 个本地 Playwright 测试全部通过。

## 相对评估的偏差

无。未修改 QA 计划、产品协议、模型选择、部署配置或 Feature 已批准制品。

## 剩余风险

- 固定 API version 与后续 Azure SDK 或服务升级的兼容性需在升级时重新验证。
- Copilot 沙箱无法访问 Azure 与部署地址；真实 Speech/Foundry 调用、Workload Identity、修正后 QA 浏览器参数及 IQA-001～IQA-003 复测均延后到候选验证和 Independent QA。

## 修复结论

BUG-001 评估确认的两个产品根因已按限定范围完成修复，本地确定性验证全部通过；真实部署修复效果等待后续候选验证和 Independent QA 复测。
