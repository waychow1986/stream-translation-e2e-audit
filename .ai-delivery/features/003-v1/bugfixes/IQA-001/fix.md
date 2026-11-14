# IQA-001 缺陷修复

## 修复信息

- **Bug ID：** IQA-001
- **Repair Batch ID：** RB-NR-DLV-20261113-BCCA3652FB86-0040
- **评估结论：** `ready_for_fix: true`，按评估确认的共享 CSP 根因修复。

## 已确认根因

生产 CSP 的 `connect-src` 只包含 Speech 自定义资源 origin，未允许 SDK 实际使用的区域 `wss://<region>.stt.speech.microsoft.com`，浏览器在英文识别前阻止 WebSocket。

## 修复范围

仅增加 Azure Speech 区域 STT WebSocket 的受限 CSP host-source，并增加聚焦 contract 回归；未修改 Speech adapter、翻译或字幕状态逻辑。

## 变更文件

| 路径 | 变更 | 根因关联 |
|---|---|---|
| `src/server/security.ts` | 在集中生成的 CSP 中加入 `wss://*.stt.speech.microsoft.com` | 允许 SDK 跨区域 STT WebSocket，同时不放行任意 WSS |
| `tests/contract/security.test.ts` | 断言配置端点、区域 STT 目标和禁止宽泛 WSS | 覆盖此前遗漏的生产连接目标 |

## 新增或修改的测试

新增聚焦 contract 测试，验证 CSP 同时允许配置的 HTTPS/WSS origin 和区域 STT WSS，并拒绝 `wss:` scheme-source 及更宽的 `*.speech.microsoft.com`。

## 执行命令与结果

- `node --test --experimental-strip-types tests/contract/security.test.ts`：修复前因缺少 `contentSecurityPolicy` 导出失败；修复后 2/2 通过。
- `npm run staticAnalysis`、`npm run build`、`npm run developerTests`、`npm run integrationTests`：最终全部通过，developerTests 23/23、integrationTests 9/9。
- `npm run functionalTests`：安装锁定版本 Chromium 后 8/8 通过。

## 相对评估的偏差

无；严格限定在 CSP Speech WSS 白名单和对应 contract 测试。

## 剩余风险

沙箱无法连接真实 Azure Speech；英文 WebSocket、音频帧、interim 和翻译草稿需由候选验证及 Independent QA 复测确认。

## 修复结论

已完成共享根因修复和本地确定性验证，IQA-001 等待真实部署环境复测。
