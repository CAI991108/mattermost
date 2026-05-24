# Landing 页面（/landing#/）维护指南

本文档总结了项目中渲染和控制 `http://localhost:8065/landing#/` （简称 landing 页面）的前端代码位置、如何修改 UI/样式、以及本地预览与调试的具体步骤。方便后续快速定位与改动。

## 结论（快速入口）
- 主要组件：`webapp/channels/src/components/linking_landing_page/linking_landing_page.tsx`
- Redux 连接器：`webapp/channels/src/components/linking_landing_page/index.tsx`
- 路由注册：`webapp/channels/src/components/root/root.tsx` （Route path: `/landing`）
- 样式（SCSS）：`webapp/channels/src/sass/routes/_get-app.scss`
- 本地开发脚本（在 `webapp` 目录下）：`npm run dev-server`

## 组件概览
- LinkingLandingPage 组件（文件 `linking_landing_page.tsx`）负责渲染：
  - 页头（logo / 自定义 site 名称）
  - 插画/图片（左侧或移动端）
  - 对话框（选择“在 App 打开”或“在浏览器查看”）
  - “记住我的偏好”复选框
  - 下载链接与 fallback 文案

- 组件内部要点：
  - 安全跳转：`safeRedirect()` 会移除 `/landing` 前缀并验证同源性，确保跳转安全。
  - Native scheme：nativeLocation 使用 `mattermost://` 协议尝试唤起原生客户端。
  - 偏好与已看过标记由 `BrowserStore`（localStorage）管理。
  - 文本由 `react-intl` 的 `FormattedMessage` 管理（i18n key 如 `get_app.launching` 等）。

## 具体编辑点（建议的最小改动位置）
1. 修改按钮/标题/文案
   - 在 `linking_landing_page.tsx` 中查找 `FormattedMessage`，常见 id:
     - `get_app.launching`（标题）
     - `get_app.continueToBrowser`（“View in Browser”）
     - `get_app.downloadTheAppNow`
   - 临时修改：可改组件内的 `defaultMessage`。长期做法：修改 `webapp/channels/src/i18n/en.json`（或对应语言文件）。

2. 修改 logo / 自定义品牌
   - `renderHeader()` 中：默认 logo 使用 `get-app__logo`，启用自定义品牌时会显示 `get-app__custom-logo` 或 `get-app__custom-site-name`。
   - brandImageUrl 来源：在 `index.tsx` 中通过 `Client4.getBrandImageUrl('0')` 传入。

3. 修改插画 / 图片
   - `renderGraphic()` 渲染 `.get-app__graphic` 下的 `<img>`，直接替换图片导入或路径即可。

4. 修改勾选框 / 行为
   - 记住偏好 checkbox 的 class 为 `get-app__checkbox`，其状态会触发 `BrowserStore.setLandingPreferenceToMattermostApp` 或 `...ToBrowser`。

5. 不要随意破坏
   - `safeRedirect()` 和偏好读取/写入逻辑影响导航与安全；修改时请谨慎保留验证与同源检查。

## 样式（SCSS）位置
- 主要样式文件：`webapp/channels/src/sass/routes/_get-app.scss`
  - 包含 `.get-app`, `.get-app__header`, `.get-app__dialog`, `.get-app__graphic`, `.get-app__buttons`, `.get-app__preference`, `.get-app__download-link` 等。
  - 若要改颜色/间距/移动端布局，在此文件中修改对应类。

## 本地预览与调试步骤
（在项目根目录或任一终端中执行，假设你在 `/home/zcai/mattermost`）

1) 进入前端目录并安装依赖（如尚未安装）：

```bash
cd /home/zcai/mattermost/webapp
npm install
```

2) 启动开发服务（webpack dev server）：

```bash
npm run dev-server
```

3) 在浏览器打开 landing 页面：

```
http://localhost:8065/landing#/
```

（如果 dev-server 在不同端口或你有后端代理，确保 URL 与本地 server 配置匹配。）

4) 如果页面被自动跳过（看不到 landing），很可能 localStorage 有偏好或已看过的标记，请在浏览器 DevTools Console 执行下列命令：

```js
// 清除 landing 已看过标记
localStorage.removeItem('__landingPageSeen__');

// 清除该站点的 landing 偏好（用你的 siteUrl 替换）
localStorage.removeItem('__landing-preference__' + 'http://localhost:8065');

// 或者检查当前值
localStorage.getItem('__landingPageSeen__');
localStorage.getItem('__landing-preference__' + 'http://localhost:8065');

// 设置偏好为浏览器（以后默认跳过 landing）
localStorage.setItem('__landing-preference__' + 'http://localhost:8065', 'browser');

// 设置偏好为 Mattermost app（以后默认唤起 app）
localStorage.setItem('__landing-preference__' + 'http://localhost:8065', 'mattermostapp');
```

5) 常见问题排查
   - 修改后无热重载：确认 `dev-server` 正常运行，或手动刷新页面。
   - 看到旧样式：确保 SASS 编译成功，并清除浏览器缓存或强制刷新（Ctrl+F5）。
   - i18n 文本未更新：修改语言文件后，可能需要重启或触发 i18n 的构建/提取脚本（参见项目文档）。

## 与测试 / 自动化的交互
- e2e/集成测试可能在用例中设置 `localStorage.__landingPageSeen__ = true` 以跳过页面；如果修改行为导致测试失败，请同时更新对应测试用例（`e2e-tests/` 或 `playwright` 相关脚本）。

## 安全与兼容性注意事项
- 保留 `safeRedirect()` 的同源检查，避免开放式重定向风险。
- 保留 UA 检测逻辑（isMobile/isAndroid/isIos）以决定使用哪个下载链接或本地 scheme。
- 若修改原生唤起逻辑（nativeLocation），请确认 `mattermost://` scheme 参数正确并且服务端预期的一致。

## 进一步改进建议（可选）
- 添加一个小型单元测试覆盖 `safeRedirect()` 的行为（happy path + 非同源 hash）以防回归。
- 如果希望更灵活的样式修改，抽出部分变量到 SASS 变量文件并在 `_get-app.scss` 中引用。
- 若需替换插画资源，建议把图片放到 `webapp/channels/src/images/` 并通过 import 引入，保持打包一致性。

---

文件记录：本指南基于仓库源码（webapp/channels）分析整理。若你希望我直接应用一个示例改动（例如把按钮文字改成中文并提交 patch），请选择一个任务：
- 我来改并提交一个小 patch 并运行 dev-server 验证（需要执行构建/启动命令）。
- 还是你本地修改，我继续在这里提供 step-by-step 辅导。
