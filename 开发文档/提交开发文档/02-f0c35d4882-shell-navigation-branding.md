# 02 - chore: update IUIN shell navigation branding

## 提交信息

- Commit: `f0c35d4882`
- 类型: 品牌壳调整
- 范围: 全局 header、产品菜单、站点名和根 HTML

## 开发目标

将 Mattermost 默认外壳中的品牌信息替换为 IUIN/SAI 场景下更合适的表达，降低默认 Mattermost 产品感。

## 改动范围

- `webapp/channels/src/components/common/site_name_and_description.tsx`
- `webapp/channels/src/components/global_header/center_controls/center_controls.tsx`
- `webapp/channels/src/components/global_header/global_header.tsx`
- `webapp/channels/src/components/global_header/left_controls/left_controls.tsx`
- `webapp/channels/src/components/global_header/left_controls/product_menu/product_branding_team_edition/product_branding_free_edition.tsx`
- `webapp/channels/src/components/global_header/left_controls/product_menu/product_branding_team_edition/product_branding_free_edition.test.tsx`
- `webapp/channels/src/components/global_header/left_controls/product_menu/product_menu.tsx`
- `webapp/channels/src/components/global_header/right_controls/right_controls.tsx`
- `webapp/channels/src/components/header_footer_route/header.tsx`
- `webapp/channels/src/root.html`

## 实现说明

- 精简或替换顶部导航中的 Mattermost 产品标识。
- 调整产品菜单中的团队版/免费版品牌文案和测试期望。
- 统一 header 左、中、右控件中的品牌入口显示。
- 更新根页面标题/标识，使浏览器层面的展示与 IUIN 平台一致。

## 验证建议

- 打开主界面，检查顶部导航、产品菜单、页面标题是否仍出现不期望的 Mattermost 品牌露出。
- 运行相关 product branding 测试，确认测试快照和断言与新文案一致。

## 回退边界

该提交只处理 shell 品牌入口。若需要恢复 Mattermost 默认外壳，可单独回退，但会重新露出默认品牌文案。
