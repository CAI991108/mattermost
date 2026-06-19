# 09 - feat: add IUIN profile editor component

## 提交信息

- Commit: `fb2826786f`
- 类型: 主要功能组件
- 范围: IUIN profile 页面、编辑器、README designer、mini card

## 开发目标

新增完整的 IUIN profile 主页和编辑体验，支持研究主页展示、主页编辑、advanced README settings、account/security 编辑入口和 academic sections 管理。

## 改动范围

- `webapp/channels/src/components/iuin_profile/index.tsx`
- `webapp/channels/src/components/iuin_profile/iuin_profile_mini_card.tsx`

## 实现说明

- 新增 profile 展示页和编辑页主组件。
- 支持 Homepage、Advanced settings、Account、Security 多 section 编辑。
- 添加 README Designer，支持代码/预览、文件树、GitHub README 导入、文件上传和下载。
- 添加 Experience、Education、Paper、Awards 四类 academic section 的编辑和展示。
- 支持 preview 与主页展示逻辑同步，使编辑页预览更接近真实主页。
- 添加 mini card，供 popover/account menu 等入口复用。

## 验证建议

- 访问 `/u/{username}` 查看个人主页。
- 访问 `/u/{username}/edit` 编辑主页内容并保存。
- 切换 Advanced settings，验证 README 文件树、GitHub import、preview 和 save。
- 编辑四类 academic section，确认主页和编辑页展示一致。

## 回退边界

该提交依赖数据层提交 `c06f5734e8`。若回退该组件，需要同时移除后续入口集成和样式提交。
