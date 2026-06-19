# 10 - feat: wire IUIN profile entry points

## 提交信息

- Commit: `1b8cc01d90`
- 类型: 路由和入口集成
- 范围: root route、profile popover、account menu

## 开发目标

把 IUIN profile 功能接入现有 Mattermost 页面流，让用户可以从账号菜单、用户 popover 和路由入口进入个人主页或编辑个人主页。

## 改动范围

- `webapp/channels/src/components/root/root.tsx`
- `webapp/channels/src/components/profile_popover/profile_popover.tsx`
- `webapp/channels/src/components/profile_popover/profile_popover_other_user_row.tsx`
- `webapp/channels/src/components/profile_popover/profile_popover_self_user_row.tsx`
- `webapp/channels/src/components/user_account_menu/user_account_menu.tsx`
- `webapp/channels/src/components/user_account_menu/user_account_name_menuitem.tsx`
- `webapp/channels/src/components/user_account_menu/user_account_profile_menuitem.tsx`

## 实现说明

- 在 root 路由中注册 IUIN profile 页面。
- 调整 profile popover 中的自我/他人用户行，使其能跳转到 IUIN profile。
- 在 account menu 中加入个人主页入口。
- 调整账号名和 profile menu item，使显示信息与 IUIN profile mini card 更一致。

## 验证建议

- 从账号菜单点击个人主页入口，确认路由跳转正确。
- 从自己的用户 popover 和他人的用户 popover 点击入口，确认分别进入对应用户主页。
- 检查 current-user-only 的编辑入口不会暴露给其他用户。

## 回退边界

该提交只负责入口接线。若回退，IUIN profile 页面组件仍存在，但用户无法从常规 UI 入口访问。
