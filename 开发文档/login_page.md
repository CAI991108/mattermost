# 登录页面（/login）快速定位与修改指南

本文档总结了在本仓库中定位并修改登录页面（http://localhost:8065/login）所需的关键文件、可修改的元素、在本地启动前端进行调试与验证的步骤，以及一个低风险的示例改动说明，便于快速上手。

## 关键文件位置

- 主组件（页面结构与逻辑）
  - `webapp/channels/src/components/login/login.tsx`
    - 负责渲染登录页面的大部分 UI 与交互逻辑（表单提交、外部登录、MFA、报错处理等）。

- 样式（SCSS）
  - `webapp/channels/src/components/login/login.scss`
    - 所有与登录页相关的视觉样式、响应式断点和动画在这里定义。

- 相关子组件（可按需修改）
  - `webapp/channels/src/components/login/login_mfa.tsx`（MFA 登录视图）
  - `webapp/channels/src/components/login/guest_magic_link_card.tsx`（访客魔法链接）
  - `webapp/channels/src/components/external_login_button/external_login_button.tsx`（第三方登录按钮）
  - `webapp/channels/src/components/widgets/icons/*`（登录按钮图标，如 Google/GitLab 图标）

## 在组件中常见的 class 与可修改的 DOM

你可以在 `login.tsx` 中直接修改这些 DOM 或对应的 internationalized 文本：

- 根容器：`.login-body`
- 左侧大标题（品牌/页面标题）：`.login-body-message` 下的 `.login-body-message-title`
  - 默认文本由 i18n 管理：formatMessage({id: 'login.title', defaultMessage: 'Log in to your account'})
- 卡片容器：`.login-body-card`
- 卡片内标题：`.login-body-card-title`
- 表单与输入：`.login-body-card-form` 中的 `.login-body-card-form-input`（login id 输入）、`.login-body-card-form-password-input`（password 输入）
- 提交按钮：通过 `SaveButton` 传入 `extraClasses='login-body-card-form-button-submit large'`
- 外部登录部分：`.login-body-card-form-login-options`（渲染 `ExternalLoginButton` 列表）

如果你需要改文本，可以修改 `formatMessage` 的 defaultMessage（用于快速本地测试）或更新 i18n 资源（更正式的做法）。

## 如何在本地运行与验证（开发模式）

项目使用 monorepo 与 npm workspaces。常用步骤：

1. 安装依赖（如果尚未安装）

```bash
cd /home/zcai/mattermost/webapp
npm install
```

（注意：workspace 依赖有时需要在仓库根运行安装，或按你本地的 workspace 设置执行。）

2. 启动开发服务器

单独启动 webapp/channels 的 dev server（更常用）：

```bash
cd webapp/channels
npm run dev-server
```

说明：channels 的 webpack dev-server 在开发配置中默认监听端口 9005（见 `webapp/channels/webpack.config.js` devServer.port）。dev-server 会将以 `/api`、`/plugins`、`/static/plugins` 开头的请求代理到后端（默认 `http://localhost:8065`，可通过环境变量 `MM_SERVICESETTINGS_SITEURL` 覆盖）。

3. 在浏览器中访问并测试

- 直接访问 dev server 页面：

  http://localhost:9005/static/root.html

- 或（若后端 server 正在运行并代理到 dev server），访问：

  http://localhost:8065/login

热重载：
- 修改 `login.tsx` 或 `login.scss` 并保存后，webpack dev-server 会热重载页面并反映更改。

## 示例：低风险修改（将左侧标题改为自定义文案）

步骤（快速测试方式）：

1. 编辑 `webapp/channels/src/components/login/login.tsx`，找到：

```tsx
<h1 className='login-body-message-title'>
    {formatMessage({id: 'login.title', defaultMessage: 'Log in to your account'})}
</h1>
```

2. 将 defaultMessage 修改为你想要的文本（仅用于本地测试）：

```tsx
{formatMessage({id: 'login.title', defaultMessage: 'Welcome back — please sign in'})}
```

3. 保存文件，回到浏览器（在 dev server 已运行的情况下），页面会热重载并显示新文本。

注意：正式改动应通过 i18n（更新 `src/i18n/*.json`）以支持多语言与翻译流程。

## 调试小贴士与常见问题

- 若页面没有热重载或改动未生效，确认你是从 dev server （9005）加载的页面（地址栏查看端口或静态文件路径）。
- 如果前端需要调用后端 API，确保后端（server）在 `http://localhost:8065` 运行，或通过设置 `MM_SERVICESETTINGS_SITEURL` 指向正确后端地址。
- 若更改样式后效果不明显，检查是否是样式被其他更具体的选择器覆盖；使用浏览器开发者工具（Elements/Styles）定位最终生效的规则。

## 参考（在仓库中的相关文件）

- 组件：`webapp/channels/src/components/login/login.tsx`
- 样式：`webapp/channels/src/components/login/login.scss`
- MFA：`webapp/channels/src/components/login/login_mfa.tsx`
- 访客魔法链接卡片：`webapp/channels/src/components/login/guest_magic_link_card.tsx`
- 外部登录按钮：`webapp/channels/src/components/external_login_button/external_login_button.tsx`
- webpack dev-server 配置：`webapp/channels/webpack.config.js`（devServer.port = 9005，proxy 指向后端）
- webapp 工作区脚本：`webapp/package.json`（scripts: dev-server, build 等）

---

如果你愿意，我可以现在为你在 `login.tsx` 中实施上面的示例改动并提交到本地分支，或直接把修改写进一个临时分支供你验证；也可以把文档再增补更多细节（比如 i18n 的具体修改步骤、如何同时启动后端 server 等）。你希望下一步我怎么做？
