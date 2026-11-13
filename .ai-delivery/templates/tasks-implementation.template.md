# {{Feature 名称}}实施任务

## 任务规则

- 每项任务使用格式：`- [ ] T001 [P?] [US?] 描述（准确仓库路径）`
- 每项任务必须引用来源 Intent、Specification 场景、Contract 或技术决策。
- 测试任务必须位于对应生产实现任务之前。
- CI、部署、Independent QA、UAT、发布、Review 和 Merge 结果属于下游平台证据。

## 依赖关系

<!-- 记录阶段依赖和 T### 之间的直接依赖。 -->

## Phase 1：Setup

- [ ] T001 {{初始化任务}}（`path/to/file`；来源：TD-###；依赖：无）

## Phase 2：Foundational

- [ ] T002 {{阻塞性基础任务}}（`path/to/file`；来源：TD-###；依赖：T001）

## Phase 3：US1 - {{用户故事标题}}

### 测试

- [ ] T003 [P] [US1] {{先行测试任务}}（`tests/path/file`；来源：IQA-###；依赖：T002）

### 实现

- [ ] T004 [US1] {{生产实现任务}}（`src/path/file`；来源：FR-###；依赖：T003）

## Phase N：Polish

<!-- 只包含已批准的跨领域工作。 -->

## 完成证据

<!-- 说明各阶段在 Coding 中可获得的证据和延后的平台证据。 -->
