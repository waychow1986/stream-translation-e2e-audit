# Coding 实施报告

<!--
本报告是跨 Coding Session 的只追加证据账本：
- 首个 Session 创建本文件：保留上面的 H1，并写入一个 `## Coding Session {nodeRunId}` 段；
- 后续每个 Session 保持已有内容逐字不变，只在文件末尾追加一个新的 `## Coding Session {nodeRunId}` 段；
- 每个 Session 段必须依次包含下面列出的全部 H3 标题，不得增删或改名；
- `{nodeRunId}` 使用提示中给出的本次 nodeRunId 原样替换。
-->

## Coding Session {nodeRunId}

### 实施范围

<!-- 本次处理的任务 ID 与来源；说明 Coding 模式（coding、coding-repair、uat-repair）。 -->

### 完成与受阻任务

<!-- 已完成任务（与结果文件 progress.completedTaskIds 一致）、受阻任务及其所需输入或决定。 -->

### 变更文件

| 路径 | 变更 | 来源任务 |
|---|---|---|
| `path/to/file` | {{变更}} | T### |

### 需求与场景覆盖

| 来源（FR / AC / IQA） | 实现路径 | 测试路径 | 结果 |
|---|---|---|---|
| FR-### / IQA-### | `path/to/file` | `path/to/file` | {{结果}} |

### 执行命令与结果

| 命令 | 环境 | 结果 | 证据 |
|---|---|---|---|
| `command` | {{环境}} | {{结果}} | {{摘要}} |

### Runtime 与下游门禁就绪制品

<!-- Dockerfile、runtime/deployment.json、Candidate identity endpoint、developer functional 脚本。 -->

### 延后平台证据

<!-- 只记录必须由候选验证、部署、Independent QA、UAT 或发布阶段产生的结果。 -->

### 剩余风险

### 实施结论

<!-- 写明本次结论（完成 / 部分完成并列出受阻项），不得声称未实际执行的结果。 -->
