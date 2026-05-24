
# Header & Footer 开发速查

本文档汇总了如何在 Mattermost webapp（channels）中定位、修改登录页及未登录页顶部的 Logo（header）和底部版权/链接（footer）。包含最小改动示例和验证步骤，便于在本地快速试验与回退。

## 关键文件（快速索引）
- Header（渲染 Logo / badge / header link）: `webapp/channels/src/components/header_footer_route/header.tsx`
- Footer（底部版权与外部链接）: `webapp/channels/src/components/header_footer_route/footer.tsx`
- 未登录模板（含 footer 的另一个实现）: `webapp/channels/src/components/header_footer_template/header_footer_template.tsx`
- Logo SVG（原始 Logo 实现）: `webapp/channels/src/components/common/svg_images_components/logo_dark_blue_svg.tsx`
- 登录页（可通过 onCustomizeHeader 传递 alternateLink/onBackButton 给 header）: `webapp/channels/src/components/login/login.tsx`

## 高层行为说明
- Header 组件决定是否渲染 Logo 或自定义站点名（SiteName），并在无 license 时显示 `freeBadge`（例如 'TEAM EDITION'）。
- Footer 从站点配置读取 About/Privacy/Terms/Help 的外部链接（Redux selector `getConfig` 提供 `AboutLink`, `PrivacyPolicyLink`, `TermsOfServiceLink`, `HelpLink`）。
- 登录页通常通过 `HFRoute` 容器懒加载 `Header` 和 `Footer`，并且组件会通过 `onCustomizeHeader` 回调向 `Header` 传入 `alternateLink` 或 `onBackButtonClick`（移动端布局或特定场景）。

## 常见修改目标与最小可行改动

1) 仅在登录页替换左上角 Logo（最小范围）

- 目标：只在登录页（或 header 路由）显示自定义图片 `webapp/channels/src/images/cuhk-sai-logo01.png`，不影响其他使用 `<Logo/>` 的页面。
- 修改点：`header.tsx` 中控制 `freeBanner` 和 `title` 的分支。

示例（概念性代码，直接替换请在本地分支测试）：

- 在 `header.tsx` 顶部引入图片（相对模块路径）:

	import customLogo from 'images/cuhk-sai-logo01.png';

- 把 `freeBanner` / `title` 中的 `<Logo/>` 改成：

	<img src={customLogo} className='header-custom-logo' alt={ariaLabel} />

- 在对应样式文件（`header.scss` 或 `header_footer_route/header.scss`）添加或调整：

	.header-custom-logo {
			height: 30px;
			width: auto;
			display: inline-block;
	}

- 验证：启动 channels 的 dev-server 并打开登录页（见“验证流程”一节）。

2) 全站替换 Logo（影响范围更大）

- 方案 A（更改 Logo 组件）：修改 `logo_dark_blue_svg.tsx`，把 SVG 换成 `<img src='...'>` 或修改 SVG 内容。
	- 优点：一次修改，整个站点 Logo 全部替换。
	- 缺点：影响范围大，需要检查站点中所有使用 Logo 的地方（例如 header，about 模态等）的样式与显示效果，测试量大。

- 方案 B（按需替换）：在关键渲染点（例如 `header.tsx`、某些 modal 中）替换 `<Logo/>` 为 `<img/>`，只修改需要的页面。

3) 修改 `TEAM EDITION` 文案或者隐藏 badge

- 修改文案：在 `header.tsx` 中找到 freeBanner 的生成处，替换字符串或改成使用 `formatMessage`（并在 i18n 中新增 key）。
- 隐藏 badge：在 CSS 中添加 `.freeBadge { display: none; }`（临时且易回退）；更稳妥的方式是移除 freeBanner 中 `<span className='freeBadge'>...</span>`。

4) 修改 Footer 的版权 / 链接

- 直接修改：编辑 `webapp/channels/src/components/header_footer_route/footer.tsx` 中的 JSX
	- 版权文本行（示例）:
		- 原文: `{`\u00a9 ${new Date().getFullYear()} Mattermost Inc.`}
		- 可改: `{`\u00a9 ${new Date().getFullYear()} MyOrg Name`}` 或固定年份 `{`\u00a9 2026 MyOrg`}

- 链接：Footer 只在 config 中存在对应链接时才渲染。三种方法：
	- 在前端硬编码附加链接（直接在 `footer.tsx` 写 `<ExternalLink href='/...'>`）
	- 修改服务器端站点配置（推荐）来设置 `AboutLink` / `PrivacyPolicyLink` 等，使 Footer 自动显示
	- 在 `header_footer_template` 中按需修改模板内容（登录/未登录不同模板）

## 验证流程（在本地快速查看改动）

1) 使用 channels 的 dev-server（推荐开发时热加载）

	cd webapp/channels
	npm install    # 若第一次或需要更新依赖
	npm run dev-server

	- dev-server 默认端口配置可见于 `webapp/channels/webpack.config.js`（通常是 9005）；该 dev-server 会 proxy 到后端（默认 8065）。
	- 访问：`http://localhost:9005/login`（或根据你的代理/后端配置访问 `http://localhost:8065/login`）

2) 生产构建（当你的环境直接提供静态 dist）：

	cd webapp/channels
	npm run build

	- 重新部署/重启后端或静态服务，让新打包的 `dist` 被使用。

3) 浏览器调试建议
	- 打开 DevTools -> Elements，找到左上角 link（class `header-logo-link`）确认元素来源（是否为 `<img>` 或 `<svg>`）。
	- Network 面板查看 logo 请求（缓存问题可右键 Disable cache 并强制刷新）。

## i18n 与区域设置注意
- 文本（例如 footer 链接文案）通常通过 react-intl 的 `formatMessage` 渲染（翻译 key 例如 `web.footer.privacy`）。
- 注意 locale 覆盖：修改 `webapp/channels/src/i18n/en.json` 时，浏览器若使用 `en-AU`，可能会优先加载 `en-AU.json`，导致你看不到修改。修改对应 locale 的 JSON 或清理/重构 dist 以确保修改生效。

## 测试注意（改动后需检查）
- 影响范围：header/footer 文本与结构的更改可能影响多处 snapshot tests 或文本断言（如 `header_footer_template.test.tsx`、`onboarding_tasklist`、`signup` 等测试）。
- 建议修改流程：
	1. 在本地分支做最小 UI 改动并跑相应单测（或 snapshots）
	2. 更新快照或调整断言（只修改那些确实受 UI 变更影响的测试）

## 回滚与最小风险策略
- 首选最小范围修改（只替换登录页 header，而不是更改 logo 组件全局行为）。
- 使用 CSS 隐藏或覆盖样式作为快速可回退方案（例如隐藏 badge）而非删除 JSX，便于回滚。

## 小结
- 登录页左上角的可点击 logo 是由 `Header`（`header.tsx`） 渲染的 `<Logo/>`（SVG 在 `logo_dark_blue_svg.tsx`），要替换图像最直接的改动点在 `header.tsx`。
- 底部版权/链接在 `footer.tsx`，链接 URL 来自站点配置（推荐在配置层修改），文案由 i18n 控制。

如果你需要，我可以为你：
- （A）生成一个最小补丁把 `header.tsx` 在登录页替换成 `images/cuhk-sai-logo01.png`（并添加对应样式），或
- （B）把 `logo_dark_blue_svg.tsx` 改为使用图片（全站替换），或
- （C）修改 footer 的版权/链接示例并更新相关测试快照。

请选择要我直接应用的方案（A / B / C / 仅要文档），我会在本地应用补丁并验证构建/热重载是否能正常显示。 

