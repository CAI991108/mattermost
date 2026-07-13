# 20 - feat: open custom status from profile badge

## 提交信息

- Commit: `49a2d02083`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 功能
- 范围: IUIN profile 头像状态、CustomStatusModal 复用

## 简介

允许用户在自己的个人主页点击头像右下角状态徽标，直接打开现有 GitHub 风格状态卡片；查看别人主页时仍只展示状态。

## 开发目标

头像状态不仅要能展示，也要成为自己的状态编辑入口，交互上与 GitHub 头像状态保持一致，同时避免在别人主页误打开当前用户的状态编辑器。

## 改动范围

- `webapp/channels/src/components/iuin_profile/index.tsx`

## 实现说明

- 引入 `openModal`、`CustomStatusModal` 和 `ModalIdentifiers.CUSTOM_STATUS`。
- 为 `canEdit` 的个人主页状态徽标渲染原生 button。
- 点击 button 时打开现有状态弹窗。
- 非本人主页仍渲染为只读 `span`。

## 验证建议

- 打开自己的 `/u/{username}`，点击头像状态徽标，确认出现状态弹窗。
- 打开其他用户主页，确认状态徽标只展示不打开编辑弹窗。
- 用键盘聚焦自己的状态徽标并回车，确认也可打开。

## 回退边界

可单独回退，回退后头像状态仍可展示，但不能直接点击打开状态弹窗。
