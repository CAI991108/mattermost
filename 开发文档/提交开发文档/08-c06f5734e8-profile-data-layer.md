# 08 - feat: add IUIN profile data layer

## 提交信息

- Commit: `c06f5734e8`
- 类型: 数据层和服务端支持
- 范围: IUIN profile 数据结构、README workspace、用户设置接口和偏好常量

## 开发目标

为 IUIN profile 提供持久化数据层，使主页内容、README workspace、academic entries、状态可见性和编辑器所需数据能够在用户 profile props 中稳定存取。

## 改动范围

- `server/channels/api4/user.go`
- `webapp/channels/src/components/iuin_profile/html_code_editor.tsx`
- `webapp/channels/src/components/iuin_profile/profile_data.ts`
- `webapp/channels/src/components/iuin_profile/use_joined_channels.ts`
- `webapp/channels/src/packages/mattermost-redux/src/constants/preferences.ts`

## 实现说明

- 增加 IUIN profile 所需的 profile props 解析和序列化工具。
- 定义 README workspace 文件结构、主 README、支持文件、序列化和反序列化逻辑。
- 增加 academic entries、section visibility、legacy markdown/html 兼容处理。
- 增加 joined channels 标签辅助 hook。
- 在服务端用户 API 中补充 IUIN profile settings 所需信息。
- 更新偏好常量，支持 profile 相关持久化键。

## 验证建议

- 创建/编辑个人主页内容后刷新页面，确认数据仍存在。
- 导入 README workspace 后检查序列化内容可被重新解析。
- 检查 legacy 内容是否能正常迁移到新的 README 结构。

## 回退边界

该提交是后续 IUIN profile 页面和样式的基础，不建议单独回退。若回退，需要同时移除 profile 页面入口和编辑器组件。
