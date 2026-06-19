# 12 - fix: render IUIN profile outside channel shell

## 提交信息

- Commit: `4d0024c763`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: IUIN profile 路由、Root 布局、频道外壳隔离

## 简介

让个人主页在进入 `/u/{username}` 时脱离 channel 页面外壳，避免频道列表、成员栏和频道工具继续残留在个人主页界面。

## 开发目标

个人主页应作为独立页面展示，只保留平台级导航能力，不继续继承当前频道的侧边栏、成员列表和 channel layout。

## 改动范围

- `webapp/channels/src/components/root/root.tsx`
- `webapp/channels/src/components/iuin_profile/index.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile.scss`

## 实现说明

- 为 IUIN profile 路由增加独立主内容容器。
- 让 profile 页面使用独立布局，不再嵌入频道主界面。
- 调整页面容器样式，保证个人主页在独立布局下仍能居中、滚动和响应式展示。

## 验证建议

- 打开 `/u/{username}`，确认不再显示频道消息区、成员栏和频道侧栏。
- 从用户菜单进入个人主页，确认路由仍可正常跳转。
- 返回频道页，确认频道布局不受影响。

## 回退边界

可单独回退该提交，但回退后个人主页会重新落入 channel shell，可能再次出现频道元素残留。
