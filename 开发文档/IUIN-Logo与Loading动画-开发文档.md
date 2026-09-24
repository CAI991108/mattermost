# IUIN Logo 与 Loading Page 动画开发文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档类型 | 前端品牌与首屏加载开发文档 |
| 当前状态 | 已实现、已接入主站、持续维护 |
| 功能基线 | `master` / `d77a216dce` |
| 首次整合提交 | `f6db367f0a` |
| 最近相关提交 | `1ac6c8cf9e` |
| 适用范围 | Mattermost Webapp、登录/未登录 Header、全局 Header、初始 Loading Page、favicon、静态资源恢复 |
| 更新时间 | 2026-07-11 |

## 2. 摘要

本开发线完成了两类工作：

1. 将 Mattermost 默认品牌替换为人工智能学院 SAI/IUIN 品牌，包括站点 Logo、Wordmark、favicon、Header/Footer 和产品菜单入口。
2. 将默认 Loading Spinner 改造为 Canvas 驱动的 SAI Logo 动画系统，并补充首屏最短展示、动画销毁、随机模式、指定模式、旧 Chunk 自动恢复和局域网 Loading 故障排查能力。

当前实现并不是简单替换一张 SVG。历史上以 SVG/Logo 组件为入口，但现状是：

- `logo_dark_blue_svg.tsx` 保留原组件名和调用契约，实际渲染 `sai-wordmark-light.png`。
- Loading Page 使用 Canvas 在运行时绘制学院 Logo，不依赖外部 SVG 请求。
- `webapp/channels/src/images/logo.svg` 仍是资源文件，但不是当前全局 Header 的唯一 Logo 来源。

## 3. 目标与非目标

### 3.1 开发目标

- 首屏、登录页和主界面的品牌表现一致。
- Loading 动画不阻塞 React 应用初始化。
- 动画在弱网和较慢设备上仍可正确结束、销毁。
- 支持随机动画，也支持通过 URL 固定动画模式进行调试。
- 避免 Webpack 重建后旧页面引用已删除 Chunk 而永久停留在 Loading Page。
- 保留 Mattermost 原有组件接口，降低上游升级时的改动面。

### 3.2 非目标

- 不把品牌资源改造成运行时可配置的多租户 Brand Kit。
- 不通过远程 CDN 加载首屏核心 Logo。
- 不在 Loading Page 初始化业务 API 或用户数据。
- 不把产品菜单 Logo 点击行为简化为固定跳转；当前仍保留产品下拉菜单。

## 4. 当前架构

```text
root.html
  ├─ favicon / 初始 CSS
  ├─ 静态资源失败监听与缓存恢复
  └─ initial_loading_screen_template.html
       └─ Canvas + Loading Caption
            └─ InitialLoadingScreenClass
                 ├─ 选择 loading_mode
                 ├─ Canvas 绘制 SAI Logo
                 ├─ requestAnimationFrame 驱动动画
                 ├─ 最短展示 2200ms
                 └─ 完成后停止动画并移除 DOM/CSS

React 应用启动
  ├─ Global Header / Product Menu
  │    └─ logo_dark_blue_svg.tsx
  │         └─ sai-wordmark-light.png
  └─ 登录/未登录 Header、Footer、Landing 页面
```

## 5. 模块与文件索引

### 5.1 Logo 与品牌资源

| 文件 | 职责 |
|---|---|
| `webapp/channels/src/components/common/svg_images_components/logo_dark_blue_svg.tsx` | 兼容原 Logo 组件接口，当前输出 SAI Wordmark 图片 |
| `webapp/channels/src/images/sai-wordmark-light.png` | 深色 Header 使用的学院字标 |
| `webapp/channels/src/images/sai-wordmark-dark.png` | 浅色背景备用字标 |
| `webapp/channels/src/images/sai-ai-mark.png` | SAI 独立图形标识 |
| `webapp/channels/src/images/cuhk-sai-logo01.png` | 学院 Logo 资源 |
| `webapp/channels/src/images/cuhk-sai-logo02.png` | 学院 Logo 资源变体 |
| `webapp/channels/src/images/logo.svg` | 仓库内 SVG Logo 资源，需确认具体调用点后再替换 |
| `webapp/channels/src/images/favicon/*` | 浏览器 favicon 与未读/提及状态图标 |

### 5.2 Header、Footer 与产品菜单

| 文件 | 可见位置 |
|---|---|
| `components/global_header/left_controls/product_menu/product_menu.tsx` | 登录后的顶部左侧产品菜单 |
| `components/global_header/left_controls/product_menu/product_branding_team_edition/product_branding_free_edition.tsx` | 产品菜单中的 SAI Wordmark |
| `components/header_footer_route/header.tsx` | 登录页、注册页等未登录页面 Header |
| `components/header_footer_route/footer.tsx` | 未登录页面 Footer |
| `components/common/site_name_and_description.tsx` | 站点名及描述 |

产品 Logo 当前点击后打开产品菜单。`071b3f2084` 曾改为直接导航，`2e48440a24` 恢复了下拉菜单；后续修改不得再次把按钮替换成无菜单的首页跳转。

### 5.3 Loading Page

| 文件 | 职责 |
|---|---|
| `components/initial_loading_screen/initial_loading_screen_template.html` | 首屏 DOM 模板、Canvas 和加载文案 |
| `components/initial_loading_screen/initial_loading_screen.css` | 全屏背景、Canvas 尺寸、Caption、进入/退出动画和响应式规则 |
| `components/initial_loading_screen/initial_loading_screen_class.ts` | 动画模式、Canvas 绘制、生命周期、性能埋点和销毁 |
| `webapp/channels/src/root.html` | 注入 Loading 模板、favicon、加载前静态资源恢复 |
| `webapp/channels/src/entry.tsx` | React 初始化后的 Chunk/CSS 加载异常恢复 |
| `webapp/channels/webpack.config.js` | 开发环境保留旧哈希 Chunk，减少 watcher 重建导致的白屏 |

## 6. Loading 动画实现

### 6.1 DOM 结构

`initial_loading_screen_template.html` 提供三个稳定节点：

- `initialPageLoadingScreen`：全屏根容器。
- `initialPageLoadingAnimation`：动画状态容器。
- `initialPageLoadingLogoCanvas`：实际 Canvas。

Caption 当前为“正在加载 SAI-NET”。如果只修改文案，不应改动节点 ID，因为 `InitialLoadingScreenClass` 依赖这些 ID 获取 DOM。

### 6.2 Logo 绘制

`drawSchoolAiLogo()` 使用 Canvas Path 绘制学院 Logo，逻辑画布为 `260 × 210`。动画模式先从该画布生成 Logo Mask、像素目标、分区或粒子，再投射到实际可视 Canvas。

优势：

- 首屏不需要等待额外 SVG/PNG 请求。
- 所有模式共享同一个 Logo 几何来源。
- 可以基于 Mask 实现粒子、扫描、翻转和文字填充。

修改 Logo 几何时，应优先修改 `drawSchoolAiLogo()`，并逐一验证全部动画模式，而不是只检查默认随机结果。

### 6.3 动画模式

当前 `LOADING_MODES`：

| 模式 | 说明 |
|---|---|
| `particles` | 粒子聚合成 Logo |
| `star` | 星图/节点式构成 |
| `ascii` | 字符场构成 |
| `flip` | 分块翻转 |
| `growth` | 生长式显现 |
| `ray` | 光束投射 |
| `binary` | 二进制/字符解析 |
| `signal` | 信号与摩尔纹效果 |
| `aurora-field` | 极光场效果 |
| `star-ignite` | 星点点燃与连线 |

默认随机选择。调试时可使用：

```text
http://<host>:8065/?loading_mode=particles
http://<host>:8065/?loading_mode=aurora-field
```

非法值会回退为随机模式。

### 6.4 生命周期

1. 构造函数查找 Loading DOM 与 CSS。
2. Desktop App 环境直接销毁 Web Loading Screen。
3. `start()` 记录开始时间、恢复 loading class、启动 Canvas。
4. 应用初始化完成后调用 `stop(pageType)`。
5. 保证总展示时间不少于 `2200ms`。
6. 切换到 loaded class，CSS 执行淡出和缩小。
7. 停止 `requestAnimationFrame`、断开 `ResizeObserver`，移除 DOM 与首屏 CSS。
8. 如果动画结束事件丢失，Fallback Timer 负责最终销毁。

## 7. 静态资源与 Loading 故障恢复

### 7.1 问题来源

开发 watcher 重建后，旧页面可能仍引用旧的 `main.<hash>.js` 或懒加载 Chunk。如果构建过程清理了旧文件，页面会在 React 初始化前或动态 import 时失败，看起来像“一直卡在 Loading Page”。

### 7.2 当前处理

- `root.html` 在 React 启动前监听同源 `/static/*.js` 和 `/static/*.css` 加载失败。
- `entry.tsx` 处理 `ChunkLoadError`、`Loading chunk`、CSS Chunk 和静态脚本异常。
- 恢复时清理 Cache Storage、注销 Service Worker，并追加 `cache_bust` 重新加载。
- 使用 `sessionStorage` 和两分钟冷却，避免无限刷新。
- `webpack.config.js` 在开发模式设置 `clean: false`，保留旧哈希 Chunk；生产构建仍清理输出目录。

该恢复机制只处理可识别的静态资源错误。普通业务异常仍应进入 Mattermost 的错误栏和日志，不应触发整页刷新。

### 7.3 网络可达性不是前端构建问题

侧边设备卡 Loading Page 时，还必须检查后端监听：

```bash
scripts/iuin-platform.sh status
ss -ltnp | rg ':8065'
curl http://127.0.0.1:8065/api/v4/system/ping
```

健康的局域网状态应监听 `0.0.0.0:8065`。仅监听 `127.0.0.1:8065` 时，本机可用但侧边设备不可达，应使用：

```bash
scripts/iuin-platform.sh restart-public
```

## 8. 历史演进

### 8.1 早期开发来源

历史分支中可见以下阶段性提交，但它们并非当前 `master` 的逐个祖先提交：

| Commit | 内容 |
|---|---|
| `01524becbf` / `c2823c1158` | 随机 SAI Loading Screen 与 CUHKSZ favicon |
| `695ab57d41` | 替换 Mattermost Logo 为 CUHKSZ SAI 品牌 |
| `1a2e8f8c14` | 白色 Loading 背景及中文文案优化 |

这些内容最终以整合提交 `f6db367f0a` 进入当前主线。

### 8.2 当前 master 的规范历史

| Commit | 阶段 |
|---|---|
| `f6db367f0a` | 首次整合 LoadingAnimation、Logo 与 UI 品牌改造 |
| `120eeef2c5` | 更新 IUIN Shell 导航品牌 |
| `20b274700a` | 刷新 Landing Shell 样式 |
| `935357bb55` | 补齐 IUIN 国际化文案 |
| `071b3f2084` | 将 Logo 改为导航入口，后续因交互回归被修正 |
| `6c2d078ffd` | 强化 IUIN Web Loading 恢复 |
| `2e48440a24` | 恢复顶部 Logo 产品下拉菜单 |
| `9ffd176c92` | 稳定子菜单 Hover/键盘过渡 |
| `1ac6c8cf9e` | 增加旧 Bundle/Chunk 自动恢复与开发构建保留策略 |

## 9. 修改指南

### 9.1 替换 Header Wordmark

1. 将新资源放入 `webapp/channels/src/images/`。
2. 修改 `logo_dark_blue_svg.tsx` 的 import。
3. 保留 `height`、`width`、`style` 和其余 `img` props 透传。
4. 检查登录页、产品菜单、窄屏和深色 Header。

### 9.2 修改 Loading Logo

1. 修改 `drawSchoolAiLogo()`。
2. 使用 `loading_mode` 依次检查全部模式。
3. 检查 1x/2x devicePixelRatio。
4. 检查 720px 以下视口。
5. 验证应用完成加载后 Canvas、Observer 和 RAF 都已销毁。

### 9.3 新增动画模式

1. 将模式名加入 `LOADING_MODES`。
2. 在 `createShowcaseLogoLoading()` 中初始化模式数据。
3. 在渲染循环中增加分支。
4. 保证清理函数取消 RAF 并断开 Observer。
5. 提供固定 URL 验证记录。

## 10. 验证清单

- [ ] 登录页、未登录页和主站 Header 显示同一品牌体系。
- [ ] Logo 点击仍打开产品菜单。
- [ ] favicon 在普通、未读、提及状态下可辨识。
- [ ] 每个 `loading_mode` 都能显示并顺利退出。
- [ ] Loading 总展示时间不少于 2200ms。
- [ ] 浏览器缩放、Retina 和移动端 Canvas 无模糊或裁切。
- [ ] `prefers-color-scheme: dark` 下仍使用预期白色背景策略。
- [ ] 旧 Chunk 404 时最多触发一次自动恢复，不出现刷新循环。
- [ ] 业务 JS 异常不会被误判为 Chunk 错误。
- [ ] `scripts/iuin-platform.sh status` 显示对外监听地址正确。

## 11. 已知约束与维护建议

- `logo_dark_blue_svg.tsx` 名称与实际 `<img>` 实现不一致，这是兼容性命名，重命名前需检查全部 import。
- Loading 动画文件体积较大且使用 `// @ts-nocheck`，新增模式时应避免继续扩大单文件职责。
- Canvas 动画尚未提供专门的 `prefers-reduced-motion` 简化分支，后续可增加静态 Logo Fallback。
- Loading 恢复使用浏览器 Cache Storage 和 Service Worker API；受限浏览器会跳过清理但仍尝试刷新。
- 品牌色、图片和 Canvas Logo 目前存在多个来源，后续可抽取统一 Brand Token，但不应在没有视觉验收的情况下批量替换。

## 12. 回退边界

- Header Logo 资源替换可以单独回退。
- 产品菜单交互不能只回退 `2e48440a24`，否则可能恢复直接跳转回归。
- Loading 视觉和 Bundle 恢复逻辑应分开回退：前者位于 `initial_loading_screen/*`，后者位于 `root.html`、`entry.tsx`、`webpack.config.js`。
- 回退 Loading 恢复后，开发 watcher 重建期间更容易出现旧 Chunk 404 和永久 Loading。
