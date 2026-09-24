# 11 - style: add IUIN profile editor styling

## 提交信息

- Commit: `62c86b4910`
- 类型: 样式
- 范围: IUIN profile 展示页、编辑页、advanced settings、academic cards 和响应式布局

## 开发目标

为 IUIN profile 功能补齐完整视觉层，使主页展示、编辑页、advanced README settings、account/security 页面和 academic section 在同一设计语言下工作。

## 改动范围

- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 定义 IUIN profile 主页面、编辑页面、侧栏导航、卡片和表单样式。
- 同步 Homepage 和 Edit Homepage 的 academic section 颜色与组件格式。
- 统一 Experience、Education、Paper、Awards 四类展示样式，并处理标题和 description 渲染规则。
- 为 Advanced settings 的 README Designer 补齐 Overleaf 风格外观、按钮位置、保存态和非流光动效。
- 删除不需要的顶部摘要组件，替换过丑的提示、GitHub import、Download README 和按钮风格。
- 处理弹窗遮罩、响应式布局、按钮 hover/active、reduce motion 等细节。

## 验证建议

- 在桌面和窄屏分别查看 `/u/{username}` 与 `/u/{username}/edit`。
- 检查 Homepage、Advanced settings、Account、Security 四个 section 的布局一致性。
- 验证 Advanced settings 的 Cancel/Save 与 Homepage 编辑页位置一致。
- 验证没有恢复已撤回的流光/扫光效果。

## 回退边界

该提交只含样式，但覆盖面很大。单独回退后 profile 功能仍存在，但页面会退回未设计状态，advanced settings 也会失去后续视觉修复。
