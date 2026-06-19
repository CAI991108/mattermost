# 16 - fix: remove readme workbench title bar

## 提交信息

- Commit: `2e7aee323e`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: README Designer、Profile customization 工作台

## 简介

删除 README Designer 顶部无效标题栏，让编辑区更直接地进入实际内容和工具操作。

## 开发目标

Profile customization 页面已经有侧边栏和页面语境，额外的 README Designer 标题栏信息价值低、占空间且破坏整体界面简洁度。

## 改动范围

- `webapp/channels/src/components/iuin_profile/index.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 移除 README workbench 的独立标题区域。
- 调整工作台顶部间距，避免删除标题后留下空白。
- 保持 Code/Preview、Import、Download 等实际工具入口不变。

## 验证建议

- 打开 Profile customization，确认 README Designer 标题栏已消失。
- 检查 Code/Preview 切换和 Advanced/Profile customization 工作台仍能正常使用。
- 确认删除标题后页面顶部没有异常留白。

## 回退边界

可单独回退，回退只会恢复标题栏，不影响 README 数据和导入能力。
