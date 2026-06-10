# SidebarRight Tab 栏改造 - 工作记录

## 任务描述

将右侧面板（SidebarRight）从"按需弹出"改造为"Tab 切换"模式。在面板最右边增加一个垂直图标栏，包含 4 个频道级功能的切换按钮：成员列表、频道信息、置顶帖、频道文件。用户进入频道时默认打开 RHS 并显示成员列表，通过 Tab 栏切换不同视图。当线程/搜索等事件触发视图打开时，Tab 栏隐藏；关闭事件视图后自动回到之前的 Tab 状态。频道头部原有的成员、置顶、文件、信息按钮已移除，由 Tab 栏替代。

### RHS 的两种内容渲染类型

4 个 Tab 对应的视图在 RHS 内部走两条不同的渲染路径：

- **独立组件型（成员、详情）**：`sidebar_right.tsx` 的 if-else 链直接渲染 `<ChannelMembersRhs/>` 或 `<ChannelInfoRhs/>`，是完整的独立 React 组件，有自己的 header、列表、操作逻辑。
- **搜索复用型（置顶、文件）**：不走 if-else 链，而是通过外层的 `<Search>` 组件渲染 `<SearchResults/>`。本质是"按条件搜索帖子/文件"，复用搜索结果的展示框架。这也是为什么它们调用的 action（`showPinnedPosts`、`showChannelFiles`）除了切状态，还会发起 API 搜索请求。

两种类型在 Tab 栏层面是统一的——都只是 dispatch 一个 action 改 `rhsState`，差异在底层渲染。

## 代码变更

### 新增文件

| 文件 | 说明 |
|---|---|
| `components/rhs_tab_bar/rhs_tab_bar.tsx` | 垂直 Tab 栏组件，4 个图标按钮 |
| `components/rhs_tab_bar/index.ts` | 导出 |
| `components/rhs_tab_bar/rhs_tab_bar.scss` | Tab 栏样式 |

### 修改文件

| 文件 | 说明 |
|---|---|
| `components/sidebar_right/sidebar_right.tsx` | 集成 RhsTabBar，新增 wrapper 布局，频道级视图时显示 Tab 栏；删除 Ctrl+. 和 Ctrl+Shift+I/Ctrl+Alt+I 快捷键监听 |
| `sass/layout/_sidebar-right.scss` | 添加 wrapper 和 container 的 flex 布局样式 |
| `actions/global_actions.tsx` | 进入频道时默认打开 RHS 显示成员列表 |
| `components/rhs_header_post/rhs_header_post.tsx` | 线程视图关闭按钮改为 goBack() |
| `components/search_results_header/search_results_header.tsx` | 搜索结果关闭按钮改为 goBack()；新增 `hideControls` prop 控制返回/关闭按钮显隐 |
| `components/post_edit_history/edited_post_item/index.ts` | 添加 goBack action |
| `components/post_edit_history/edited_post_item/edited_post_item.tsx` | 编辑历史关闭改为 goBack() |
| `components/channel_header/channel_header.tsx` | 移除成员、置顶、文件、信息 4 个按钮 |
| `components/channel_members_rhs/header.tsx` | 移除关闭和返回按钮 |
| `components/channel_members_rhs/channel_members_rhs.tsx` | 更新 Header 调用 |
| `components/channel_info_rhs/header.tsx` | 移除关闭和返回按钮 |
| `components/channel_info_rhs/channel_info_rhs.tsx` | 更新 Header 调用 |
| `components/search_results/search_results.tsx` | 置顶/文件视图传 `hideControls={true}` 隐藏返回和关闭按钮 |
| `keyboard_shortcuts/keyboard_shortcuts_sequence/keyboard_shortcuts.ts` | 注释掉 `navOpenCloseSidebar` 和 `navOpenChannelInfo` 帮助文档条目 |
| `keyboard_shortcuts/keyboard_shortcuts_modal/keyboard_shortcuts_modal.tsx` | 删除快捷键帮助弹窗中对应的两行显示 |

## 逻辑说明

### 1. Tab 栏组件 (RhsTabBar)

定义了 4 个 Tab 配置（成员/信息/置顶/文件），每个 Tab 关联一个 `RHSStates` 常量。点击 Tab 时通过 `useDispatch` 调用对应的 action（`showChannelMembers`、`showChannelInfo`、`showPinnedPosts`、`showChannelFiles`），这些 action 都是现有的，不需要新增。当前激活的 Tab 通过 `useSelector(getRhsState)` 判断并高亮。

### 2. SidebarRight 布局改造

在 `sidebar_right.tsx` 的 render 中，原来的 `sidebar-right-container` 外面包了一层 `sidebar-right-container-wrapper`，用 `display: flex` 水平排列内容区和 Tab 栏。Tab 栏通过条件判断 `showTabBar` 决定是否显示——只有在频道级视图（info/members/pin/files）或没有其他事件视图时才显示。

### 3. 默认打开 RHS

在 `global_actions.tsx` 的 `emitChannelClickEvent` 函数中，频道切换完成后增加逻辑：如果当前频道不是 DM/GM，且 RHS 未打开或正在显示频道级 Tab 视图，就自动调用 `showChannelMembers(channelId)` 打开成员列表。

### 4. 事件视图关闭后回到 Tab

将线程视图（`rhs_header_post.tsx`）、搜索结果（`search_results_header.tsx`）、编辑历史（`edited_post_item.tsx`）的关闭按钮从 `closeRightHandSide()` 改为 `goBack()`。`goBack` 会读取 `previousRhsState`（现有机制），自动恢复到关闭前的 Tab 状态。

### 5. 移除频道头部按钮

从 `channel_header.tsx` 中移除了 `memberListButton`（成员按钮）、`pinnedButton`（置顶按钮）、文件按钮（`HeaderIconWrapper` + `channelFilesIcon`）和 `ChannelInfoButton`（信息按钮）。这些功能完全由右侧 Tab 栏替代。

### 6. 移除频道级视图的关闭/返回按钮

`channel_members_rhs/header.tsx` 和 `channel_info_rhs/header.tsx` 中的关闭按钮（×）和返回按钮（<）被移除，因为 Tab 栏已经提供了切换方式，不再需要关闭或返回操作。

### 7. 置顶/文件视图隐藏关闭和返回按钮

`search_results_header.tsx` 新增 `hideControls?: boolean` prop，当为 `true` 时隐藏返回按钮（←）和关闭按钮（×）。`search_results.tsx` 在渲染置顶（`isPinnedPosts`）或文件（`isChannelFiles`）视图时传 `hideControls={true}`，搜索、@提及、收藏等其他场景不受影响。这样 4 个 Tab 视图（成员、详情、置顶、文件）的 header 行为保持一致——都没有关闭/返回按钮，导航完全由 Tab 栏承担。

### 8. 删除与 Tab 模式冲突的快捷键

删除了 `Ctrl+.`（开关 RHS）和 `Ctrl+Shift+I`/`Ctrl+Alt+I`（切换频道信息）的快捷键。RHS 改为常驻后"关闭"操作无意义，频道信息已是 Tab 之一不需要独立快捷键。保留了 `Ctrl+Shift+.`（展开/折叠 RHS）因为不冲突。同时从 `keyboard_shortcuts.ts`（帮助文档定义）和 `keyboard_shortcuts_modal.tsx`（帮助弹窗显示）中移除了对应条目。