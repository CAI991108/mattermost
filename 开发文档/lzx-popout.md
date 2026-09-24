# Popout 小窗口系统 - 工作记录

## 系统架构

Mattermost 内置了一套 Popout 系统，可以将频道、线程、搜索结果、插件 RHS、帮助页面以独立浏览器窗口打开。系统分 3 层：

### 1. 入口层（按钮/菜单项）→ 已全部删除（帮助除外）

用户在界面上触发弹窗的按钮/菜单项，使用 `<PopoutButton>` 或 `<PopoutMenuItem>` 组件。

原始共 9 个入口，按功能分为 3 类：

**频道相关（3个）**

| 入口文件 | 位置 | 触发函数 |
|---|---|---|
| `channel_header.tsx` | 频道头部工具栏 | `popoutChannel()` |
| `channel_header_menu.tsx` | 频道名右键菜单 | `popoutChannel()` |
| `sidebar_channel_menu.tsx` | 侧边栏频道右键菜单 | `popoutChannel()` |

**线程相关（3个）**

| 入口文件 | 位置 | 触发函数 |
|---|---|---|
| `rhs_header_post.tsx` | 右侧面板线程 header | `popoutThread()` |
| `thread_pane.tsx` | 全局线程列表面板 | `popoutThread()` |
| `thread_menu.tsx` | 线程右键菜单 | `popoutThread()` |

**搜索/插件/帮助（3个）**

| 入口文件 | 位置 | 触发函数 |
|---|---|---|
| `search_results.tsx` + `search_results_header.tsx` | 搜索结果面板 header | `popoutRhsSearch()` |
| `rhs_plugin.tsx` | 插件 RHS 面板 | `popoutRhsPlugin()` |
| `help_button.tsx` | 编辑器底部帮助按钮 | `popoutHelp()` |

### 两种运行模式

Popout 系统在不同运行环境下行为不同：

**浏览器模式**（`isDesktopApp()` 返回 false）
- 通过 `window.open()` 打开新浏览器弹窗
- 窗口尺寸：宽 800px，定位在主窗口右上角（`window.screenX + window.outerWidth - 800`）
- 子窗口与父窗口通过 `window.postMessage()` 双向通信
- 子窗口内的导航行为被拦截，URL 变化通知父窗口同步跳转

**桌面端模式**（`isDesktopApp()` 返回 true）
- 通过 `DesktopApp.setupDesktopPopout()` 打开原生桌面窗口
- 通信通过 `DesktopApp.sendToParentWindow()` / `DesktopApp.onMessageFromParentWindow()`
- 桌面端窗口标题通过 `DesktopApp.updatePopoutTitleTemplate()` 动态更新（支持 `{serverName}` / `{channelName}` / `{teamName}` 模板变量）
- `canPopout()` 会检查桌面端是否允许弹窗（`DesktopApp.canPopout()`），浏览器端始终返回 true

### 2. 调度层（`utils/popouts/popout_windows.ts`）→ 保留

| 函数 | 作用 | 生成的 URL |
|---|---|---|
| `popoutChannel()` | 打开频道小窗 | `/_popout/channel/:team/:path/:id` |
| `popoutThread()` | 打开线程小窗 | `/_popout/thread/:team/:postId` |
| `popoutRhsSearch()` | 打开搜索 RHS 小窗 | `/_popout/rhs/:team/search` |
| `popoutRhsPlugin()` | 打开插件 RHS 小窗 | `/_popout/rhs/:team/plugin/:id` |
| `popoutHelp()` | 打开帮助小窗 | `/_popout/help` |
| `popout()`（内部） | 核心函数，浏览器调 `window.open()`，桌面端调 `DesktopApp.setupDesktopPopout()` | — |

辅助函数：
- `canPopout()` — 判断当前环境是否支持弹窗
- `isChannelPopoutWindow()` — 判断当前窗口是否是频道小窗
- `isPopoutWindow()` — 判断当前窗口是否是任意小窗

### 3. 渲染层（`PopoutController` → 各 Popout 组件）→ 保留

`PopoutController`（`components/popout_controller/popout_controller.tsx`）负责路由分发：

| 路径 | 组件 | 说明 |
|---|---|---|
| `/_popout/channel/:team/:path/:id` | `ChannelPopout` | 完整频道视图（含聊天 + RHS） |
| `/_popout/thread/:team/:postId` | `ThreadPopout` | 线程视图 |
| `/_popout/rhs/:team` | `RhsPopout` | 搜索/插件 RHS |
| `/_popout/help/:page?` | `HelpPopout` | 帮助页面 |

### 通信机制

小窗口与父窗口之间通过 `window.postMessage()` 通信：
- `browser_popouts.ts` — 父窗口端，管理 window.open + 消息监听
- `use_browser_popout.ts` — 子窗口端，拦截导航 → 通知父窗口跳转，关闭前通知父窗口
- `focus.ts` + `use_popout_focus.ts` — 焦点状态同步（子窗口聚焦时通知父窗口标记已读）
- `use_popout_title.ts` — 动态更新小窗口标题

### websocket_actions.ts 中的特殊处理

- 频道被改名时：如果当前是 channel popout，重定向到新路径
- 被踢出频道时：如果当前是 channel popout，关闭窗口

## 本次修改

仅前端入口删除，无后端/API 变更。

| 文件 | 说明 |
|---|---|
| `channel_header.tsx` | 删除频道头部 PopoutButton + popoutChannelView 方法 |
| `channel_header_menu.tsx` | 删除菜单中「在新窗口打开」项 |
| `sidebar_channel_menu.tsx` | 删除侧边栏频道右键菜单中「在新窗口打开」项 |
| `rhs_header_post.tsx` | 删除线程 RHS header 的 PopoutButton + popout 方法 |
| `search_results_header.tsx` | 删除 PopoutButton + newWindowHandler prop |
| `search_results.tsx` | 删除 newWindowHandler 回调 + popoutRhsSearch import |
| `thread_pane.tsx` | 删除全局线程面板的 PopoutButton + popout 回调 |
| `thread_menu.tsx` | 删除线程右键菜单的 PopoutMenuItem + popout 回调 |
| `rhs_plugin.tsx` | 删除插件 RHS 的 newWindowHandler + popoutRhsPlugin 相关代码 |

### 保留的入口

- `help_button.tsx` — 编辑器帮助按钮仍可打开帮助小窗

### 同步删除的死文件

- `components/channel_header_menu/menu_items/open_in_new_window.tsx`
- `components/popout_button.tsx`
- `components/popout_menu_item.tsx`

## 后续计划

私信改造时复用 `popoutChannel()` + `ChannelPopout`，在私信列表新位置添加入口即可。底层设施完整，无需重新开发。
