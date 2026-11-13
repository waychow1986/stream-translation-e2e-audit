# {{Feature 名称}}实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T### [P?] [US#?] 描述（路径；来源：…；依赖：…）`
- 路径必须位于 design 的 "Component 边界与项目结构" 路径清单内。
- 每项任务引用来源：Specification 中的 US / FR / AC / IQA、design 中的 Contract 或技术决策。
- 测试任务位于对应生产实现任务之前；测试素材优先自行合成，并提交到 design 声明的测试路径。
- 候选验证、部署、Independent QA、UAT、发布和合并结果属于下游平台证据，不作为任务。

## 依赖关系

<!-- 记录阶段之间以及 T### 之间的直接依赖。 -->

## Phase 1：Setup

- [ ] T001 {{初始化任务}}（`path/to/file`；来源：TD-###；依赖：无）

## Phase 2：Foundational

- [ ] T002 {{阻塞性基础任务}}（`path/to/file`；来源：TD-###；依赖：T001）

<!--
随后按已批准优先级为每个用户故事追加一个阶段，例如：

## Phase 3：US1 - 用户故事标题

### 测试

- [ ] T003 [P] [US1] 先行测试任务（`path/to/file`；来源：IQA-###；依赖：T002）

### 实现

- [ ] T004 [US1] 生产实现任务（`path/to/file`；来源：FR-###；依赖：T003）

只有已批准的跨领域工作才追加 `## Phase N：Polish`。
Convergence 修复任务只能由 convergence-append 模式在文件末尾追加 `## Convergence Phase N`。
-->

## 完成证据

<!-- 说明各阶段在 Coding 中可获得的证据，以及延后的平台证据。 -->
