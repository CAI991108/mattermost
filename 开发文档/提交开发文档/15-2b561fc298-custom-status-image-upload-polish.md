# 15 - fix: polish custom status image upload

## 提交信息

- Commit: `2b561fc298`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: 自定义状态弹窗、图片上传、视觉还原

## 简介

把状态弹窗恢复到更接近 GitHub 的原有外观，并在该基础上保留自定义图片上传能力，修复上传控件造成的布局和视觉问题。

## 开发目标

状态弹窗应保持 GitHub 风格：输入区、emoji 选择、建议状态、Busy、Expiration 和 Visible to 的布局都要稳定；图片上传只是 emoji 区域的增强能力，不能破坏弹窗结构。

## 改动范围

- `webapp/channels/src/components/custom_status/custom_status_modal.tsx`
- `webapp/channels/src/components/custom_status/custom_status.scss`
- `webapp/channels/src/components/custom_status/custom_status_modal.test.tsx`

## 实现说明

- 收敛图片上传入口，避免出现突兀的右侧上传按钮。
- 保持状态文本输入框宽度和 GitHub 弹窗布局一致。
- 修复上传控件导致的溢出、错位和焦点状态问题。

## 验证建议

- 打开状态弹窗，确认布局与 GitHub 风格一致。
- 上传一张图片作为状态 emoji，确认预览和保存正常。
- 选择默认 emoji 建议，确认原有流程不受影响。

## 回退边界

可单独回退，但回退后图片上传入口和弹窗视觉会退回较粗糙版本。
