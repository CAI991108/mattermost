# 06 - feat: rebuild custom status modal

## 提交信息

- Commit: `ea5399d5a9`
- 类型: 功能重构
- 范围: Custom status modal 组件逻辑

## 开发目标

将原 custom status 页面改为更接近 GitHub status 弹窗的交互：可编辑状态内容、选择 emoji/图片、设置 busy、过期时间和可见范围。

## 改动范围

- `webapp/channels/src/components/custom_status/custom_status_modal.tsx`

## 实现说明

- 重建状态编辑弹窗结构，替换旧页面式状态编辑体验。
- 加入 GitHub 风格的状态输入、快捷状态、busy 勾选和说明文本。
- 支持 emoji 位置导入图片，满足头像/图标自定义状态需求。
- 保留保存、清除、关闭等原有状态流转能力。
- 优化弹窗遮罩和层级，使遮罩覆盖整个界面而不是局部区域。

## 验证建议

- 打开状态编辑弹窗，验证遮罩覆盖全屏。
- 设置普通状态、busy 状态、过期时间和可见范围。
- 上传图片后保存，再重新打开确认状态内容仍可读。
- 清除状态后确认 UI 和用户状态同步。

## 回退边界

该提交只包含组件逻辑，不包含最终样式和测试。若单独回退，需要同时考虑后续 `dce39ecb8d` 的样式/测试提交。
