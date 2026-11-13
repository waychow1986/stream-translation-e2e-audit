# 项目宪章

## 产品与架构

- 保持已批准的业务意图和范围。
- 优先选择满足可衡量需求的最简单架构。
- 记录重大决策和有充分理由的例外。

## 安全与隐私

- 凭据保留在服务端；支持时使用 managed identity。
- 验证输入、执行 least privilege，绝不记录 secret 或客户内容。

## 测试与质量

- 每项用户可见能力都必须具有可独立执行的验收场景。
- 外部 integration 必须针对真实测试服务执行 contract、integration 和 end-to-end 测试。
- Mock 不能替代 functional acceptance 证据。
- Coding 沙箱自测不得访问或验证 Azure/云资源、远程部署环境、托管身份、网络或 RBAC；
  这些环境相关用例只能由 Independent QA 针对已部署的精确 Candidate 执行。
- 性能、延迟、可靠性和安全需求必须具有可衡量门禁。

## 交付治理

- Intent、Specification、Technical Solution、测试和任务必须保持可追踪。
- Intent 必须通过自检；每个后续阶段必须通过自检及与已批准直接前置制品的一致性检查。
- 默认修复当前阶段；只有已批准前置制品存在重大歧义、矛盾、不可实现、不安全或治理冲突时才能返回上游。
- CI 前必须通过 Convergence。
- CI、Independent QA、人工审批和发布证据均为必需门禁。
