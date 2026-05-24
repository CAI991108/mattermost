# Loading animation（刷新/初始加载）

本文档汇总了项目里在页面刷新或初始加载时展示的 Mattermost logo 动画的位置、控制逻辑，以及如何替换为自定义动画或静态资源的可执行步骤。适合开发者在本地快速替换、测试与回退。

## 关键文件

- `webapp/channels/src/components/initial_loading_screen/initial_loading_screen_template.html`
  - 这是初始加载画面的 HTML 模板。包含一个全屏背景的 inline SVG，以及负责动画的容器：
    - `id="initialPageLoadingAnimation"` 的 div 包含了当前的 spinner/logo SVG（即你看到的动画）。

- `webapp/channels/src/components/initial_loading_screen/initial_loading_screen.css`
  - 控制加载动画的 CSS（变量、关键帧、类名如 `.LoadingAnimation`, `.LoadingAnimation--spinning`, `.LoadingAnimation--loading`）。
  - 动画效果（旋转、针转动、收缩/淡入淡出等）都定义在这里。

- `webapp/channels/src/components/initial_loading_screen/initial_loading_screen_class.ts`
  - 一个小的 TypeScript 控制类：在 app 启动前通过 DOM 查询到 `initialPageLoadingScreen` 与 `initialPageLoadingAnimation`，并对其添加/移除类来启动或结束动画。它负责监听动画结束事件并在完成后移除 DOM（或切换到 loaded 状态）。

- `webapp/channels/src/root.html`
  - 构建时通过 webpack/html-loader 将上述模板嵌入到最终的 root HTML。该文件是应用最早被浏览器加载的页面，替换模板会影响页面首次渲染的视觉表现。

## 动画的运行时行为（简述）

1. 页面最早加载时（在 JS bundle 执行前），`root.html` 中注入的初始加载模板会被浏览器渲染。
2. `initial_loading_screen_class.ts`（或等效 runtime 逻辑）会查询模板中的元素并通过添加类（例如 `LoadingAnimation--spinning`）来触发 CSS 动画。
3. 当应用加载完成并且需要隐藏加载画面时，控制类会移除/替换类，并监听动画结束（animationend）事件来做 DOM 清理或状态切换。

保持这些 id 和类（`initialPageLoadingAnimation`、`.LoadingAnimation`、`.LoadingAnimation--spinning` 等）不变可以让现有逻辑继续工作，而仅替换内部 SVG/图片通常是最安全的做法。

## 三种替换策略（从简单到可配置）

1) 直接替换 inline SVG（推荐，最快）
  - 位置：编辑 `initial_loading_screen_template.html`，找到 `id="initialPageLoadingAnimation"` 下的 SVG 内容，替换为你的自定义 SVG（保留外层 div 的 id 与类）。
  - 优点：首次渲染即可看到自定义动画，无需改动 JS；保留了现有 CSS 类和生命周期逻辑。
  - 注意：如果你使用的 SVG 包含自己的动画（SMIL 或 CSS），请确保命名或 keyframes 不会与现有 CSS 冲突；也可以把你的 SVG 包裹在一个容器内并使用更具体的选择器。

2) 使用静态图片 / GIF / APNG / WebP 或 Lottie（简单替换）
  - 方案 A (图片)：将图片放到 `webapp/channels/src/images/`（或项目中现有前端静态资源目录），在 `initial_loading_screen_template.html` 中把 SVG 替换为：
    - `<img src="/static/your-image-path.png" alt="loading" id="initialPageLoadingImage" class="LoadingAnimation__image" />`
    - 保留外层 `div#initialPageLoadingAnimation` 的类名，必要时为图片添加 CSS（例如 `max-height`, `width:auto`, `display:block; margin:0 auto`）。
  - 方案 B (Lottie)：如果想用 Lottie 动画（JSON），需要在模板中引入一个轻量的 runtime loader（lottie-player 或 lottie-web），并在 `initial_loading_screen_class.ts` 中在 start() 阶段初始化 Lottie 播放。注意：这会在 JS 可用时才运行（因此可能在最早画面不可见），或需要把最小运行时代码内联到 template 里。
  - 优点：简单，兼容传统图片/动画格式。
  - 注意：使用外部图片会增加额外的网络请求，若不想影响首次渲染，可将图片以 data URI 内联到 template（但会增大 HTML 大小）。

3) 运行时注入 / 配置化（复杂但灵活）
  - 思路：保留模板中的占位容器（例如 `<div id="initialPageLoadingAnimation" class="LoadingAnimation">`），并让 `initial_loading_screen_class.ts` 在 start() 时根据运行时设置（例如 config 中的 brand URL、环境变量或 window.__CUSTOM_LOADING__）去注入不同的 DOM（inline SVG / img / Lottie container）。
  - 优点：可在同一构建下为不同站点或配置动态加载不同动画，无需改动模板，每次发布也更灵活。
  - 实现要点：
    - 在 `initial_loading_screen_class.ts` 的 start() 中增加注入逻辑（在现有添加类之后或之前）：
      - 读取配置（`window.SITE_SETTINGS` 或 `window.__CUSTOM_LOADING__`），决定注入 `innerHTML`（SVG 或 `<img>`）或初始化 lottie。
      - 保持现有的 class 名和 animation lifecycle（animationend 监听、stop() 行为）不变。
    - 需写清楚回退逻辑（当配置不存在或资源加载失败时使用默认 SVG）。

## 具体操作步骤（推荐按 1→2→3 渐进）

A. 快速试验（推荐） — 直接替换 inline SVG
  1. 打开 `webapp/channels/src/components/initial_loading_screen/initial_loading_screen_template.html`。
  2. 找到 `id="initialPageLoadingAnimation"` 的元素，复制当前 SVG 以做备份（或在 git 上新建分支）。
  3. 把内部 SVG 内容替换为你的自定义 SVG（或将带动画的 SVG 粘贴进去）。
  4. 保存并在 dev-server 下重载（`webapp` 目录下运行 `npm run dev-server` 或你常用的本地构建命令），在浏览器打开应用并刷新，观察首屏加载动画是否为自定义 SVG。

B. 使用图片替换
  1. 把图片放入 `webapp/channels/src/images/`（或项目约定的静态资源目录）。注意路径分发规则，开发时 `dev-server` 通常会把 `src` 下的静态资源可在 `/static/` 下访问。
  2. 编辑 `initial_loading_screen_template.html`，在 `initialPageLoadingAnimation` 内替换为 `<img src="/static/images/your.png" .../>`。
  3. 如果需要，编辑或新增 CSS（`initial_loading_screen.css`）来控制图片大小与居中行为。

C. 运行时注入（配置化）
  1. 在 `initial_loading_screen_class.ts` 的 `start()` 中，添加读取全局配置与注入逻辑：
     - 例如：
       - `const custom = (window as any).__CUSTOM_LOADING__;`
       - 如果存在 `custom.type === 'svg'` 且 `custom.svg` 字符串存在，则 `animationContainer.innerHTML = custom.svg`。
       - 对于图片，设置 `animationContainer.innerHTML = '<img src="' + custom.url + '"/>'`。
  2. 添加错误回退：若注入失败或资源加载 error，则将 `animationContainer` 恢复为默认内联 SVG（可以从模板里复制一份作为 fallback）。
  3. 可选：在部署配置（server-side）中注入 `<script>window.__CUSTOM_LOADING__ = {...}</script>` 到 `root.html`，让每个站点的构建/运维配置该值。

## 测试清单（完成替换后逐项确认）

- [ ] 刷新页面（cold load）时能看到自定义动画，而非默认 Mattermost 动画。
- [ ] 动画不会阻塞主应用的 JS 启动（页面能继续加载）。
- [ ] 应用加载完成后加载动画能顺利结束并被 DOM 清理（或被隐藏），不影响后续交互。
- [ ] 在移动端/小屏幕下显示正常（无被裁切或错位）。
- [ ] 若使用远程图片，资源加载失败时能回退到默认动画或静默失败不会阻断应用启动。

## 回滚与维护建议

- 任何替换应在独立分支上进行并保留对原始模板（或原始 SVG）的拷贝，以便快速回滚。
- 对于频繁切换或多个品牌的场景，建议实现运行时注入/配置化方案（第 3 种），并将 site-specific 的链接配置在 server 渲染的 `root.html` 中（例如通过 `window.__CUSTOM_LOADING__`）以做到零构建切换。

## 常见问题与注意事项

- 为什么我看不到更改？
  - 本地 dev-server 可能有缓存或静态资源映射规则。确保重启 dev-server，并清空浏览器缓存（或使用无缓存模式）。
  - 若资源放在非预期路径，检查浏览器 network 面板确定资源 404/加载失败。

- 我能直接把 Lottie JSON 直接放进 template 吗？
  - 理论上可以把轻量的 lottie-player web component 内联到 template（例如使用 unpkg 上的 lottie-player script），但这会把一段 JS 注入到最早的 HTML，可能影响首屏加载时间。更稳妥的是在 `initial_loading_screen_class.ts` 在 JS 可用阶段动态初始化 Lottie。

---

如果你愿意，我可以：

- 现在就把 `initial_loading_screen_template.html` 中的 SVG 用你的 SVG 替换（请上传 SVG 或给出 SVG 内容）；或者
- 直接应用一个图片替换示例并修改 CSS；或者
- 实现运行时注入的最小版本（代码 + server-side 在 `root.html` 注入示例配置），并在本地运行 dev-server 验证。

请选择你想要的下一步，以及是否提供自定义动画文件（SVG/GIF/Lottie JSON）。
