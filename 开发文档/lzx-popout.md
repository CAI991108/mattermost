# Popout 小窗口系统 - 工作记录

## 系统架构

Mattermost 内置了一套 Popout 系统，可以将频道、线程、搜索结果、插件 RHS、帮助页面以独立浏览器窗口打开。系统分 3 层：

### 1. 入口层（按钮/菜单项）→ 已全部删除（帮助除外）

用户在界面上触发弹窗的按钮/菜单项，使用 `<PopoutButton>` 或 `<PopoutMenuItem>` 组件。

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

### 死文件（无引用，未删除）

- `components/channel_header_menu/menu_items/open_in_new_window.tsx`
- `components/popout_button.tsx`
- `components/popout_menu_item.tsx`

## 后续计划

私信改造时复用 `popoutChannel()` + `ChannelPopout`，在私信列表新位置添加入口即可。底层设施完整，无需重新开发。
