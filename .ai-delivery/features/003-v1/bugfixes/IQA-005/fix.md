# IQA-005 缺陷修复

## 修复信息

- **Bug ID：** IQA-005
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

CSP 阻止 SDK 的区域 STT WSS，连续英文场景没有任何有效 Speech、草稿、final 或 fixed 时间点，全部实时性指标被前置阻塞。

## 修复范围

仅受限放行区域 STT WSS 并补充 contract 回归；未修改获批时限、调度器或测试接口。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 增加区域 STT WSS CSP host-source | 消除实时链路的识别前阻塞 |
| `tests/contract/security.test.ts` | 验证实际目标和最小授权 | 防止同类 CSP 回归 |

## 新增或修改的测试

新增聚焦 CSP contract 测试；既有本地功能测试继续覆盖 6/5/3 秒边界判定逻辑。

## 执行命令与结果

- 聚焦测试修复前失败，修复后 2/2 通过。
- staticAnalysis、build、developerTests（23/23）与 integrationTests（9/9）最终通过。
- 包含时限判定场景的 functionalTests 安装 Chromium 后 8/8 通过。

## 相对评估的偏差

无；未把缺失事件的哨兵值当成有效测量，也未调整任何性能边界。

## 剩余风险

CSP 修复不能证明真实 Speech、网络、调度和 Foundry 延迟达标；三个时限必须在真实候选环境完整重测。

## 修复结论

已消除 IQA-005 的识别前 CSP 阻塞并完成本地回归，NFR 结果等待平台真实计时证据。
