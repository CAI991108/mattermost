# 03 - chore: refresh IUIN landing shell styles

## 提交信息

- Commit: `af2fe743f0`
- 类型: 页面壳样式
- 范围: landing、footer、loading screen、主题变量和 webpack 配置

## 开发目标

继续去除默认 Mattermost 落地页和加载页的产品感，使首屏、页脚、链接落地页和基础主题变量更贴近 IUIN 平台。

## 改动范围

- `webapp/channels/src/components/header_footer_route/footer.tsx`
- `webapp/channels/src/components/initial_loading_screen/initial_loading_screen.css`
- `webapp/channels/src/components/linking_landing_page/linking_landing_page.tsx`
- `webapp/channels/src/sass/admin_console_base/_sys_css_variables.scss`
- `webapp/channels/src/sass/base/_css_variables.scss`
- `webapp/channels/webpack.config.js`

## 实现说明

- 大幅简化默认 footer 内容，减少无关产品链接和噪声。
- 调整初始 loading screen 的视觉风格。
- 简化 linking landing page，使其更像 IUIN 平台入口而非通用 Mattermost 入口。
- 调整 Sass 变量中的基础品牌色和系统变量。
- 配合 webpack 配置处理对应静态资源/构建行为。

## 验证建议

- 强刷登录页和链接落地页，确认视觉样式更新生效。
- 检查初始加载态背景、品牌文案和 favicon/标题。
- 如果前端 chunk 缓存异常，清理浏览器缓存后再验证。

## 回退边界

可单独回退该提交恢复默认落地页和基础变量，但可能与后续 IUIN 品牌壳提交出现视觉不一致。
