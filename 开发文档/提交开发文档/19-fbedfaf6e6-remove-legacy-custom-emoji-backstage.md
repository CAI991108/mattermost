# 19 - fix: remove legacy custom emoji backstage entry

## 提交信息

- Commit: `fbedfaf6e6`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: Backstage、自定义 emoji 管理入口、emoji picker 默认入口

## 简介

删除旧的 Backstage Custom Emoji 管理入口，并让旧 `/emoji` 路径跳转到 integrations，避免保留无用页面。

## 开发目标

状态图片上传已经内聚到状态弹窗和 emoji picker 中，旧 Backstage Custom Emoji 管理页面对当前 IUIN 体验没有价值，应从用户路径中移除。

## 改动范围

- `webapp/channels/src/components/backstage/*`
- `webapp/channels/src/components/team_controller/team_controller.tsx`
- `webapp/channels/src/components/emoji_picker/*`
- `webapp/channels/src/components/backstage/components/backstage_sidebar.test.tsx`

## 实现说明

- 从 Backstage sidebar 删除 Custom Emoji 入口。
- 删除 `/emoji` 和 `/emoji/add` 的管理路由暴露。
- 旧团队 emoji 路径改为跳转 integrations。
- 保留后端 custom emoji API，避免影响状态上传和历史 emoji 数据。

## 验证建议

- 打开 Backstage，确认不再出现 Custom Emoji 侧边栏项。
- 访问 `/{team}/emoji`，确认跳转到 integrations。
- 打开状态弹窗上传 emoji，确认不受 Backstage 入口删除影响。

## 回退边界

可单独回退，回退后旧 Custom Emoji 管理入口会重新出现。
