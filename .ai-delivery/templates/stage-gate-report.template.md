# {{阶段}}阶段门禁报告

## 门禁信息

- **阶段：** `{{stage}}`
- **检查轮次：** {{attempt}}
- **当前制品：** `{{artifact}}`
- **直接前置制品：** `{{predecessor 或“无”}}`
- **结论：** `通过` / `需要修复`

## 内部自检

<!-- 检查完整性、内部一致性、职责边界、可测试性和交接就绪性。 -->

## 直接前置一致性检查

<!-- Intent 无前置制品；其他阶段只检查已批准的直接前置制品。 -->

## 阻塞项

### {{FINDING-ID}} {{问题摘要}}

- **严重性：** `high`
- **范围：** `self` / `predecessor`
- **制品：** `{{artifact}}`
- **责任 Agent：** `{{owner}}`
- **路由：** `current_stage` / `upstream_exception`
- **原因类型：** `ambiguity` / `contradiction` / `incomplete` / `coverage` /
  `infeasible` / `unsafe` / `governance` / `other`
- **证据：**
- **修复建议：**

## 通过条件

<!-- findings 为空时明确记录当前阶段自检及直接前置一致性检查通过。 -->
