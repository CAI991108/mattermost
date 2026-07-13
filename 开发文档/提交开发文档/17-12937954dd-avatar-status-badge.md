# 17 - feat: add GitHub-style avatar status badge

## 提交信息

- Commit: `12937954dd`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 功能
- 范围: IUIN profile 头像状态、GitHub 风格状态展示

## 简介

在个人主页头像右下角加入 GitHub 风格状态徽标，默认显示 emoji，hover 时展开展示状态文字。

## 开发目标

个人主页状态展示应与 GitHub 头像状态一致：状态贴在头像右下角，正常态轻量，鼠标移动上去后展开文本。

## 改动范围

- `webapp/channels/src/components/iuin_profile/index.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 从用户 `customStatus` 或 IUIN profile status 字段解析头像状态。
- 支持普通 emoji 和状态图片两种显示来源。
- 使用 pill 形徽标定位到头像右下角，并在 hover/focus 时展开文字。

## 验证建议

- 设置一条有 emoji 和文字的状态，打开个人主页确认头像右下角展示状态。
- hover 状态徽标，确认出现文字。
- 使用上传图片状态，确认图片能在徽标中展示。

## 回退边界

可单独回退，回退后头像右下角不再显示 GitHub 风格状态，但状态弹窗和保存能力仍存在。
