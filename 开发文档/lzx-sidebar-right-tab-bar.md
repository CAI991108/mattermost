# SidebarRight Tab 栏改造 - 工作记录

## 任务描述

将右侧面板（SidebarRight）从"按需弹出"改造为"Tab 切换"模式。在面板最右边增加一个垂直图标栏。初版包含 4 个频道级功能入口：成员列表、频道信息、置顶帖、频道文件；后续根据入口收口要求，Tab 栏当前可见入口调整为 3 个：成员列表、置顶帖、频道文件。频道详情功能本体保留，但不再作为 RHS TabBar 可见入口。用户进入频道时默认打开 RHS，普通频道显示成员列表，DM/GM 显示置顶帖。线程/搜索等事件触发视图打开时，Tab 栏隐藏；关闭事件视图后自动回到之前的 Tab 状态。频道头部原有的成员、置顶、文件、信息按钮已移除，由 Tab 栏和收口后的菜单入口承担导航。

### RHS 的两种内容渲染类型

Tab 对应的视图在 RHS 内部走两条不同的渲染路径：

- **独立组件型（成员、详情）**：`sidebar_right.tsx` 的 if-else 链直接渲染 `<ChannelMembersRhs/>` 或 `<ChannelInfoRhs/>`，是完整的独立 React 组件，有自己的 header、列表、操作逻辑。其中“详情”能力仍然保留，但当前不再出现在 RhsTabBar 的可见入口中。
- **搜索复用型（置顶、文件）**：不走 if-else 链，而是通过外层的 `<Search>` 组件渲染 `<SearchResults/>`。本质是"按条件搜索帖子/文件"，复用搜索结果的展示框架。这也是为什么它们调用的 action（`showPinnedPosts`、`showChannelFiles`）除了切状态，还会发起 API 搜索请求。

两种类型在 Tab 栏层面曾经统一为 dispatch 一个 action 改 `rhsState`；入口收口后，当前 TabBar 只暴露成员、置顶、文件 3 个可见入口，详情继续作为底层 RHS 能力保留。

## 代码变更

### 新增文件

| 文件 | 说明 |
|---|---|
| `components/rhs_tab_bar/rhs_tab_bar.tsx` | 垂直 Tab 栏组件；初版为成员/信息/置顶/文件 4 个图标按钮，当前可见入口为成员/置顶/文件 3 个 |
| `components/rhs_tab_bar/index.ts` | 导出 |
| `components/rhs_tab_bar/rhs_tab_bar.scss` | Tab 栏样式 |

### 修改文件

| 文件 | 说明 |
|---|---|
| `components/sidebar_right/sidebar_right.tsx` | 集成 RhsTabBar，新增 wrapper 布局，频道级视图时显示 Tab 栏；删除 Ctrl+. 和 Ctrl+Shift+I/Ctrl+Alt+I 快捷键监听 |
| `sass/layout/_sidebar-right.scss` | 添加 wrapper 和 container 的 flex 布局样式 |
| `actions/global_actions.tsx` | 进入频道时默认打开 RHS；普通频道默认成员列表，DM/GM 默认置顶帖 |
| `components/rhs_header_post/rhs_header_post.tsx` | 线程视图关闭按钮改为 goBack() |
| `components/search_results_header/search_results_header.tsx` | 搜索结果关闭按钮改为 goBack()；新增 `hideControls` prop 控制返回/关闭按钮显隐 |
| `components/post_edit_history/edited_post_item/index.ts` | 添加 goBack action |
| `components/post_edit_history/edited_post_item/edited_post_item.tsx` | 编辑历史关闭改为 goBack() |
| `components/channel_header/channel_header.tsx` | 移除成员、置顶、文件、信息 4 个头部按钮；同步移除频道标题组件的 `teamId` 传参 |
| `components/channel_members_rhs/header.tsx` | 移除关闭和返回按钮 |
| `components/channel_members_rhs/channel_members_rhs.tsx` | 更新 Header 调用 |
| `components/channel_info_rhs/header.tsx` | 移除关闭和返回按钮 |
| `components/channel_info_rhs/channel_info_rhs.tsx` | 更新 Header 调用 |
| `components/search_results/search_results.tsx` | 置顶/文件视图传 `hideControls={true}` 隐藏返回和关闭按钮 |
| `keyboard_shortcuts/keyboard_shortcuts_sequence/keyboard_shortcuts.ts` | 注释掉 `navOpenCloseSidebar` 和 `navOpenChannelInfo` 帮助文档条目 |
| `keyboard_shortcuts/keyboard_shortcuts_modal/keyboard_shortcuts_modal.tsx` | 删除快捷键帮助弹窗中对应的两行显示 |
| `components/channel_header_menu/channel_header_menu_items/channel_header_public_private_menu.tsx` | 公开/私有频道头部菜单收口：移除详情、静音、通知偏好、普通成员入口；保留频道设置、书签、自动翻译、LDAP Groups、插件更多操作、离开/归档相关操作；修复插件分组为空时的双分割线 |
| `components/channel_header_menu/menu_items/channel_settings_menu.tsx` | 支持并转发 `Menu.FirstMenuItemProps`，确保删除原首项后新的首项仍保留键盘导航/自动聚焦/无障碍属性 |
| `components/channel_header/channel_header_text.tsx` | 无标题时不再渲染“添加频道标题”入口；有标题时继续显示已有标题 |
| `components/sidebar/sidebar_channel/sidebar_channel_menu/sidebar_channel_menu.tsx` | 频道列表三点菜单移除静音/取消静音入口 |
| `components/sidebar/sidebar_channel/sidebar_channel_menu/index.ts` | 清理频道列表三点菜单静音状态和 mute/unmute action 注入 |
| `components/channel_header_menu/channel_header_menu.tsx` | DM/GM 头部保留头像和名字，但不再渲染下拉菜单容器和箭头；公开/私有频道继续使用原菜单 |
| `sass/layout/_headers.scss` | 新增静态标题修饰样式，去掉 DM/GM 头部标题 hover 高亮和可点击视觉 |


## 逻辑说明

### 1. Tab 栏组件 (RhsTabBar)

初版定义了 4 个 Tab 配置（成员/信息/置顶/文件）。入口收口后，当前可见 Tab 配置为成员/置顶/文件 3 个；频道信息 RHS 仍保留在系统中，但 `RHSStates.CHANNEL_INFO` 不再作为 TabBar 可见入口。点击可见 Tab 时通过 `useDispatch` 调用对应的 action（`showChannelMembers`、`showPinnedPosts`、`showChannelFiles`），当前激活的 Tab 通过 `useSelector(getRhsState)` 判断并高亮。DM/GM 下成员 Tab 继续隐藏，因此 DM/GM 可见 Tab 主要为置顶和文件。

### 2. SidebarRight 布局改造

在 `sidebar_right.tsx` 的 render 中，原来的 `sidebar-right-container` 外面包了一层 `sidebar-right-container-wrapper`，用 `display: flex` 水平排列内容区和 Tab 栏。Tab 栏通过条件判断 `showTabBar` 决定是否显示——只有在频道级视图（info/members/pin/files）或没有其他事件视图时才显示。其中 info 仍属于频道级 RHS 状态，但当前没有 TabBar 可见入口。

### 3. 默认打开 RHS

在 `global_actions.tsx` 的 `emitChannelClickEvent` 函数中，频道切换完成后增加逻辑：如果 RHS 未打开或正在显示频道级 Tab 视图，就自动打开默认 RHS 频道级视图。普通公开/私有频道默认调用 `showChannelMembers(channelId)` 打开成员列表；DM/GM 因成员 Tab 隐藏、详情 Tab 不再作为入口显示，默认调用 `showPinnedPosts(channelId)` 打开置顶帖。

### 4. 事件视图关闭后回到 Tab

将线程视图（`rhs_header_post.tsx`）、搜索结果（`search_results_header.tsx`）、编辑历史（`edited_post_item.tsx`）的关闭按钮从 `closeRightHandSide()` 改为 `goBack()`。`goBack` 会读取 `previousRhsState`（现有机制），自动恢复到关闭前的 Tab 状态。

### 5. 移除频道头部按钮

从 `channel_header.tsx` 中移除了 `memberListButton`（成员按钮）、`pinnedButton`（置顶按钮）、文件按钮（`HeaderIconWrapper` + `channelFilesIcon`）和 `ChannelInfoButton`（信息按钮）。成员、置顶、文件由右侧 Tab 栏承担；频道信息功能本体保留，但头部按钮和后续 TabBar 可见入口均已隐藏。

### 6. 移除频道级视图的关闭/返回按钮

`channel_members_rhs/header.tsx` 和 `channel_info_rhs/header.tsx` 中的关闭按钮（×）和返回按钮（<）被移除，因为 Tab 栏已经提供了切换方式，不再需要关闭或返回操作。

### 7. 置顶/文件视图隐藏关闭和返回按钮

`search_results_header.tsx` 新增 `hideControls?: boolean` prop，当为 `true` 时隐藏返回按钮（←）和关闭按钮（×）。`search_results.tsx` 在渲染置顶（`isPinnedPosts`）或文件（`isChannelFiles`）视图时传 `hideControls={true}`，搜索、@提及、收藏等其他场景不受影响。这样当前可见 Tab 视图中的置顶/文件不会出现额外关闭/返回入口，导航由 Tab 栏承担。

### 8. 删除与 Tab 模式冲突的快捷键

删除了 `Ctrl+.`（开关 RHS）和 `Ctrl+Shift+I`/`Ctrl+Alt+I`（切换频道信息）的快捷键。RHS 改为常驻后"关闭"操作无意义，频道信息不再作为可见入口也不需要独立快捷键。保留了 `Ctrl+Shift+.`（展开/折叠 RHS）因为不冲突。同时从 `keyboard_shortcuts.ts`（帮助文档定义）和 `keyboard_shortcuts_modal.tsx`（帮助弹窗显示）中移除了对应条目。

### 9. 后续入口收口调整

本次对话在 RHS TabBar 改造基础上继续做入口收口，目标是减少重复入口，保留底层能力但隐藏不需要暴露给用户的操作。

#### 9.1 RHS TabBar 隐藏详情入口

`rhs_tab_bar.tsx` 中移除了 `RHSStates.CHANNEL_INFO` 对应的可见 Tab，删除点击 Tab 时调用 `showChannelInfo` 的分支，并清理 DM 进入成员 Tab 时兜底跳详情的 effect。`ChannelInfoRhs`、`showChannelInfo` action 和 `sidebar_right` 中的详情渲染链路仍保留，因此这是入口隐藏，不是功能本体删除。

#### 9.2 公开/私有频道头部菜单收口

`channel_header_public_private_menu.tsx` 删除了公开/私有频道头部下拉菜单中的频道详情、静音频道、通知偏好和普通成员入口。保留频道设置、书签、自动翻译、LDAP Groups 管理项、插件“更多操作”、离开频道、归档/关闭/取消归档等入口。

插件“更多操作”本体逻辑未改，仍然由 `pluginItems.length` 决定是否显示。为了避免删除成员入口后插件为空时出现两条连续分割线，新增 `showPluginSection = !isMobile && pluginItems.length > 0`，只在插件分组实际可见时渲染对应分割线。

删除原第一个菜单项后，`MenuItemChannelSettings` 支持并转发 `Menu.FirstMenuItemProps`，`ChannelHeaderPublicMenu` 将 `...rest` 传给新的第一个菜单项，避免影响菜单首项的键盘导航、自动聚焦和无障碍属性。

#### 9.3 频道标题入口收口

`channel_header_text.tsx` 保留有标题时的 `ChannelHeaderTextPopover` 展示逻辑；无标题时统一返回 `null`，不再显示“添加频道标题”按钮，也不能从频道名旁边的中间区域打开 `EditChannelHeaderModal`。底层编辑弹窗和其他位置的标题编辑能力不在本次删除范围内。

#### 9.4 频道列表三点菜单收口

`sidebar_channel_menu.tsx` 删除频道列表右侧三点菜单中的静音/取消静音频道入口，并在 `index.ts` 中清理 `isChannelMuted`、`getCurrentUserId`、`muteChannel`、`unmuteChannel` 等相关状态和 action 注入。菜单仍保留标记已读/未读、复制链接、添加成员、离开频道等入口。

#### 9.5 DM/GM 私信头部菜单收口

`channel_header_menu.tsx` 对 DM/GM 提前返回纯标题结构，保留头像和名字展示，但不再渲染 `Menu.Container`、不显示下拉箭头，也不再渲染 `ChannelDirectMenu` 和 `ChannelGroupMenu`。因此点击 DM/GM 头部头像/名字不会再弹出包含关闭详情、静音、编辑频道/标题、关闭私信的菜单。

为避免视觉上仍像可点击入口，`_headers.scss` 新增 `channel-header__trigger--static` 修饰样式，去掉 DM/GM 标题区域 hover 背景，并设置 `cursor: default`。公开/私有频道没有该 static class，仍保留原来的下拉菜单和 hover 反馈。

### 注意事项

本次主要是入口隐藏和 UI 收口，底层 action、Redux 状态、API 和部分功能本体多数保留。前端测试和 snapshot 中可能仍保留旧入口断言，例如 `Add a channel header`、`Mute Channel`、`Unmute Channel`，需要后续按测试策略同步更新。
