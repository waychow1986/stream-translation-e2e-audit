# Coding 后 Convergence 报告

## 评审范围

本次按 recheck 模式复检上一轮 `CONV-005`，并检查上一轮后改动的 `src/client/session-controller.ts`、`tests/unit/session-lifecycle.test.ts`、`reports/implementation.md` 及 Coding 结果文件是否引入新的阻塞问题。未重新评审未改动且上一轮无 finding 的范围；Convergence 未执行命令，只核对实施记录、结果与测试代码。

## 结论

**通过（Converged）**。`CONV-005` 已解决：英文 interim 与 final 在超过 4000 code units 时均沿统一路径终止会话、释放资源、清除 current、保留 fixed，并忽略旧会话后续事件；用户可通过手动建立新会话恢复。改动范围未引入新的 CRITICAL 或 HIGH 问题，结果文件 findings 为空。

## 阻塞问题

无。

## 制品到实现与测试的可追溯关系

| 来源 | 实现路径 | 测试/证据路径 | 结论 |
|---|---|---|---|
| `CONV-005` / `T014`、`T017`—`T019` / design“领域与数据模型”“SLO、限制、扩缩容、重试与恢复” | `src/client/session-controller.ts:113-123`、`src/client/session-controller.ts:104-111` | `tests/unit/session-lifecycle.test.ts:134-169`、`reports/implementation.md:294-346` | 超限英文 interim 在进入 current 或 scheduler 前终止；测试覆盖资源清理、旧事件忽略、fixed 保留、current 为空及新会话恢复，上一轮 finding 已解决 |
| 上一轮后未改动且无 finding 的既有批准范围 | 上一轮报告所列 `src/client/`、`src/server/`、`src/shared/`、`Dockerfile` 与 runtime 就绪制品 | 上一轮报告所列 `tests/unit/`、`tests/contract/`、`tests/e2e/` | recheck 模式不重复评审；本轮改动未改变其契约或追溯关系 |

## 开发者验证证据复核

`reports/implementation.md:319-330` 记录了修复前新增回归测试的预期失败，以及修复后生命周期聚焦测试 5/5、developer tests 22/22、integration tests 8/8、Playwright functional tests 8/8、静态分析、构建、依赖审计和定向 runtime 检查通过。新增测试的断言与记录相符：4001 code units 的英文 interim 不产生翻译请求，Speech 与 token timer 被清理，后续旧事件不处理，current 为空，fixed 保留；新 controller 所代表的手动新会话可重新翻译并固定字幕。

实施报告未把本地协议 fake、build、health check 或平台覆盖模拟冒充真实 Azure 或下游门禁证据。复检仅核对上述记录，没有重新执行命令。

## 用户可见行为比较

修复后的超限 interim 不再静默停止调度并保持会话运行，而是按批准设计终止当前会话并清除未固定字幕；已固定字幕保持不变，旧会话不会继续出字幕。正常长度 interim/final 路径未被改动，因此 `INT-001`、`INT-005`、`INT-009` 的“边说边出”主路径没有因本轮修复被削弱。恢复仍要求用户手动新建会话，符合现有任务与设计。

## 架构、Contract、运维与任务覆盖

本轮生产改动仅在既有 controller 识别路由中前置英文长度边界，未改变浏览器直连 Speech、Fastify BFF、Foundry NDJSON 流、单容器或无持久化架构，也未增加外部产品、身份机制、telemetry backend、告警、保留策略或运维依赖。修复由现有 `T014`、`T017`—`T019` 覆盖，不存在需追加任务的 Feature 规划缺口。

根目录 `Dockerfile`、`runtime/deployment.json`、`runtime/developer-functional-run.sh`、`/healthz` 与 `/candidate-identity` 均未在本轮改动；上一轮已确认的候选就绪契约未受影响。

## 延后平台证据

不可变候选上的 Candidate checks、镜像构建与 registry digest、远程部署、真实 Azure Speech/Foundry 行为、`IQA-001`—`IQA-006`、`NFR-002` 黑盒时限、Independent QA、UAT、发布审批、GitHub review 和 merge 仍由后续平台阶段产生，不构成本轮阻塞。

## 非阻塞观察与剩余风险

- 真实 Azure Speech 是否产生超长单片段及其事件节奏只能在部署环境观察；该限制不否定已完成的确定性边界修复。
- 正常长度语音的真实 Speech/Foundry 延迟及批准的 6 秒、5 秒、3 秒边界仍待下游真实环境验证。
- 本轮未发现新的范围扩张、控制削弱、隐藏假设、无证据成功声明、secret 写入或伪造下游证据。
