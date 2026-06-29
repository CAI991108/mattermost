# 左侧边栏改造 - 工作记录

---

## 第一章：禁用「创建新分类」与「移动至」入口

### 功能介绍

#### 创建新分类

用户可以在侧边栏创建自定义分类（`CategoryTypes.CUSTOM`），用于组织自己的频道列表。

关键特性：
- 分类数据按 `UserId + TeamId` 存储，**完全私有**，每个用户拥有独立一套布局
- 底层表：`SidebarCategories(Id, UserId, TeamId, SortOrder, Sorting, Type, DisplayName, Muted, Collapsed)`
- 频道归属表：`SidebarChannels(ChannelId, UserId, CategoryId, SortOrder)`

创建流程：前端触发 → 打开 `EditCategoryModal` → 用户填写名称 → 调用 `POST /api/v4/users/{user_id}/teams/{team_id}/channels/categories` → 服务端在 `SidebarCategories` 表新增一行 → 前端 Redux 更新 → 侧边栏重新渲染。

后端核心文件：
- `server/channels/store/sqlstore/channel_store_categories.go`（SQL 读写）
- `server/channels/app/channel_category.go`（业务逻辑）
- `server/channels/api4/channel_category.go`（API 路由）

#### 「移动至」子菜单

频道右键菜单 / 频道 Header 菜单中的「移动至」子菜单，允许用户把频道拖放到其他分类，或创建新分类后直接归入。

底层 Action：`addChannelsInSidebar(categoryId, channelId)` → 更新 `SidebarChannels` 表中对应频道的 `CategoryId`。

---

### 前端入口分布

#### 创建新分类入口（共 4 处）

| # | 触发位置 | 文件 |
|---|---|---|
| 1 | 侧边栏顶部 `+` 菜单 →「Create new category」| `sidebar/sidebar_header/sidebar_browse_or_add_channel_menu.tsx` |
| 2 | 分类标题右键菜单底部 | `sidebar/sidebar_category/sidebar_category_menu/index.tsx` |
| 3 | 未读分组（UNREADS）右键菜单底部 | `sidebar/unread_channels.tsx` |
| 4 | 共用入口组件 | `sidebar/sidebar_category/sidebar_category_menu/create_new_category_menu_item.tsx` |

#### 「移动至」入口（共 4 处）

| # | 触发位置 | 文件 |
|---|---|---|
| 1 | 侧边栏频道右键菜单 | `sidebar/sidebar_channel/sidebar_channel_menu/sidebar_channel_menu.tsx` |
| 2 | 群组频道 Header 下拉菜单 | `channel_header_menu/channel_header_menu_items/channel_header_group_menu.tsx` |
| 3 | 公频/私频 Header 下拉菜单 | `channel_header_menu/channel_header_menu_items/channel_header_public_private_menu.tsx` |
| 4 | 私信 Header 下拉菜单 | `channel_header_menu/channel_header_menu_items/channel_header_direct_menu.tsx` |

---

### 本次修改

目标：从前端 UI 移除所有「创建新分类」和「移动至」入口，保留底层组件和后端逻辑。

#### 修改文件

| 文件 | 改动 |
|---|---|
| `sidebar_browse_or_add_channel_menu.tsx` | 删除 `createNewCategoryMenuItem` 变量、JSX 渲染及 `FolderPlusOutlineIcon` import；删除 Props 中的 `onCreateNewCategoryClick` |
| `sidebar_header.tsx` | 删除 Props 中的 `showCreateCategoryModal`；删除传给子组件的 `onCreateNewCategoryClick` prop |
| `sidebar.tsx` | 删除传给 `SidebarHeader` 的 `showCreateCategoryModal` prop；清理 `showCreateCategoryModal` 死代码方法 + `EditCategoryModal` 无用 import |
| `sidebar_category_menu/index.tsx` | 删除 `<CreateNewCategoryMenuItem>` JSX 及其 import；删除末尾多余的 `<Menu.Separator/>`（视觉 bug 修复） |
| `unread_channels.tsx` | 删除 `<CreateNewCategoryMenuItem>` JSX、`<Menu.Separator/>` 及其 import |
| `sidebar_channel_menu.tsx` | 删除 `<ChannelMoveToSubmenu>` JSX、`<Menu.Separator/>` 及其 import |
| `channel_header_group_menu.tsx` | 删除 `<ChannelMoveToSubMenu>` JSX 及其 import |
| `channel_header_public_private_menu.tsx` | 删除 `<ChannelMoveToSubMenu>` JSX、`<Menu.Separator/>` 及其 import |
| `channel_header_direct_menu.tsx` | 删除 `<ChannelMoveToSubMenu>` JSX 及其 import |

#### 保留不动

- `create_new_category_menu_item.tsx` — 共用入口组件本身（无引用但保留）
- `channel_move_to_sub_menu/index.tsx` — 移动至子菜单组件本身（无引用但保留）
- `channel_move_to_sub_menu_old/` — 已废弃的旧版组件（本次前已无引用）
- `edit_category_modal/` — 创建/编辑分类弹窗（保留）
- 服务端 API 及数据库操作全部保留

> 底层设施完整保留，如需后续重新引入入口，直接挂载现有组件即可，无需重新开发。

---

## 第二章：移除草稿箱侧边栏入口

### 功能介绍

#### 草稿箱（Drafts）

Mattermost 提供一个汇总页，将用户在各频道输入框中未发送的草稿集中展示在一个列表里（`/drafts` 路由）。

关键特性：
- 草稿数据分两层：
  1. **本地草稿**：存储在浏览器 localStorage，输入框离开后保留内容，与草稿箱页面无关
  2. **同步草稿**：需要 `syncedDraftsAreAllowedAndEnabled` 开启，草稿同步到服务端，跨设备可见
- 侧边栏 `DraftsLink` 组件同时承载草稿和计划发布（Scheduled Posts）两个功能的入口

#### 计划发布（Scheduled Posts）

定时发送消息的功能，路由为 `/scheduled_posts`，与草稿箱共用同一个页面组件（`Drafts`）和侧边栏入口按钮。

**需要付费 License 才能开启**：

```ts
// mattermost-redux/selectors/entities/scheduled_posts.ts
return config.ScheduledPosts === 'true' && license.IsLicensed === 'true';
```

---

### 前端入口分布

| # | 触发位置 | 文件 |
|---|---|---|
| 1 | 侧边栏固定入口（DraftsLink 组件） | `sidebar/sidebar_list/sidebar_list.tsx` |

路由定义：

| 路由 | 文件 | 行号 |
|---|---|---|
| `/:team/drafts` | `channel_layout/center_channel/center_channel.tsx` | L117-120 |
| `/:team/scheduled_posts` | `channel_layout/center_channel/center_channel.tsx` | L121-124 |
| 正则 `doesRouteBelongToTeamControllerRoutes` | `root/root.tsx` | L510 |

---

### 本次修改

目标：移除侧边栏草稿箱入口，注释相关路由（保留恢复能力），输入框本地草稿逻辑不变。

#### 修改文件

| 文件 | 改动 |
|---|---|
| `sidebar/sidebar_list/sidebar_list.tsx` | 删除 `DraftsLink` makeAsyncComponent 声明及 `<DraftsLink/>` JSX 渲染 |
| `channel_layout/center_channel/center_channel.tsx` | 注释 `Drafts` 组件声明、`/drafts` Route、`/scheduled_posts` Route；注释 `SCHEDULED_POST_URL_SUFFIX` import |
| `root/root.tsx` | 保留原正则注释版本，新正则移除 `drafts` 和 `SCHEDULED_POST_URL_SUFFIX` 两个路径片段；清理死 import `SCHEDULED_POST_URL_SUFFIX` |

#### 保留不动

- `components/drafts/` — 草稿箱页面组件全部保留
- `actions/views/drafts.ts` — 草稿相关 actions 保留
- `selectors/drafts.ts` — 草稿 selectors 保留
- 输入框本地草稿保留逻辑（`localStorage`）完全不变
- `unreads_status_handler/` 和 `mobile_channel_header/` 里的 `inDrafts` 判断保留（路由禁用后永远不触发，无副作用）

> 路由使用注释保留，如需恢复直接取消注释即可。


---

## 第三章：固定未读分组并隐藏用户设置侧栏入口

### 功能介绍

#### 未读频道单独分组

Mattermost 原本提供一个用户级侧栏设置：`Group unread channels separately`（将未读频道单独分组）。

开启后：
- 左侧频道列表顶部显示 `UNREADS` 分组
- 未读频道会进入 `UNREADS` 分组
- 原分类中的同一未读频道会被过滤掉，避免重复显示

关闭后：
- 不显示 `UNREADS` 分组
- 「Find channel」按钮左侧显示未读筛选按钮
- 点击筛选按钮后，左侧栏只显示未读频道；再次点击恢复显示所有频道

#### 私信显示数

用户设置里的 `Number of direct messages to show`（私信显示数）对应 preference：`sidebar_settings/limit_visible_dms_gms`。

它的原始作用是限制旧侧边栏 `DIRECT_MESSAGES` 分类中可见的 DM/GM 数量：
- 未读 DM/GM 永远可见
- 当前正在查看的 DM/GM 永远可见
- 其余 DM/GM 按最近查看时间截断到用户设置的数量

当前项目已将私信改造成全局私信入口，旧 `DIRECT_MESSAGES` 分类不再渲染；新的全局私信侧栏使用最近 20 个有历史会话，并未使用这个设置。因此该设置在当前定制 UI 中属于保留逻辑，不再提供入口。

---

### 本次修改

目标：不重构未读频道机制，只固定未读频道单独分组开启，并隐藏用户设置弹窗中的整个「Sidebar/侧栏」设置入口。

#### 修改文件

| 文件 | 改动 |
|---|---|
| `packages/mattermost-redux/src/selectors/entities/preferences.ts` | 将 `shouldShowUnreadsCategory` 改为固定返回 `true`，不再受用户 preference、旧 preference 或 `ExperimentalGroupUnreadChannels` 默认配置影响 |
| `components/user_settings/modal/user_settings_modal.tsx` | 在用户设置 tab 列表中将 `sidebar` tab 配置整块注释掉，并添加注释 `LZX修改，先移除` |

#### 保留不动

- `components/user_settings/sidebar/` — 侧栏设置页面组件完整保留
- `show_unreads_category/` — 「显示单独分组未读频道」设置组件保留
- `limit_visible_gms_dms/` — 「私信显示数」设置组件保留
- `UserSettings` 中 `activeTab === 'sidebar'` 渲染分支保留
- `Preferences.SHOW_UNREAD_SECTION` 与 `Preferences.LIMIT_VISIBLE_DMS_GMS` 常量保留
- 服务端配置、API、数据库均不修改

> 本次只隐藏用户设置弹窗中的侧栏设置入口。底层 UI 组件和逻辑完整保留，如需恢复，只需取消 `user_settings_modal.tsx` 中 `sidebar` tab 配置注释即可。


---

## 第四章：调整「查找频道」弹窗行为

### 功能介绍

「查找频道」对应 Mattermost 前端的 Quick Switch / Channel Switcher 弹窗。

原始能力：

- 点击左侧栏「查找频道」或使用 `Ctrl/Cmd + K` 打开弹窗
- 输入为空时，下方展示：
  - 「未读」列表
  - 「最近」列表
- 输入搜索词时，搜索范围包含：
  - 普通频道（public/private channel）
  - DM（私聊）
  - GM（群聊）
- 旧逻辑会通过用户 autocomplete 搜索用户，并把用户临时包装成 fake DM 条目，以便复用同一套频道建议列表组件展示

---

### 前端入口与核心逻辑

| 位置 | 文件 | 说明 |
|---|---|---|
| 左侧栏入口按钮 | `components/sidebar/channel_navigator/channel_navigator.tsx` | 点击「查找频道」打开 `ModalIdentifiers.QUICK_SWITCH`；`Ctrl/Cmd + K` 快捷键也在这里处理 |
| 弹窗主体 | `components/quick_switch_modal/quick_switch_modal.tsx` | 使用 `GenericModal` 渲染弹窗，内部用 `SuggestionBox` 承载搜索输入和建议列表 |
| Redux 连接 | `components/quick_switch_modal/index.tsx` | 注入 `switchToChannel`、`joinChannelById`、`closeRightHandSide` 等 action |
| 搜索 provider | `components/suggestion/switch_channel_provider.tsx` | 负责空输入建议、搜索数据源、结果过滤、排序和分组 |

---

### 本次修改

目标：默认打开弹窗下方为空白；搜索时只搜索普通频道，不再展示 DM/GM。

#### 修改文件

| 文件 | 改动 |
|---|---|
| `components/suggestion/switch_channel_provider.tsx` | 空输入时不再调用 `fetchAndFormatRecentlyViewedChannels()`，改为返回 `groups: []`，因此不展示「未读」和「最近」 |
| `components/suggestion/switch_channel_provider.tsx` | 新增/使用 `isSearchableChannel()`，只允许 `Constants.OPEN_CHANNEL` 和 `Constants.PRIVATE_CHANNEL` 进入搜索结果 |
| `components/suggestion/switch_channel_provider.tsx` | 本地搜索数据源从 `getChannelsInAllTeams` 中过滤，只保留未删除且未归档的 public/private 频道 |
| `components/suggestion/switch_channel_provider.tsx` | 远端仍调用 `searchAllChannels(channelPrefix, {nonAdminSearch: true})`，但返回结果再次过滤，只保留 public/private 频道 |
| `components/suggestion/switch_channel_provider.tsx` | `formatGroup()` 内部增加兜底过滤，非 public/private 频道直接跳过，避免 DM/GM 混入 |
| `components/suggestion/switch_channel_provider.tsx` | 移除用户 autocomplete 路径，不再通过用户搜索结果构造 fake DM 条目 |
| `components/suggestion/switch_channel_provider.tsx` | 不再拼接 `getDirectAndGroupChannels()` 和 `getGroupChannels()`，搜索数据源不包含 DM/GM |
| `components/suggestion/switch_channel_provider.tsx` | 删除旧的「未读/最近」辅助函数链及相关未使用导入，避免保留不可达逻辑 |

#### 保留不动

- `components/quick_switch_modal/quick_switch_modal.tsx` — 弹窗 UI、标题文案、说明文案、`SuggestionBox` 机制保留
- `components/quick_switch_modal/index.tsx` — Redux 连接和选中后切换频道的 action 注入保留
- `components/sidebar/channel_navigator/channel_navigator.tsx` — 左侧栏入口按钮和 `Ctrl/Cmd + K` 快捷键保留
- `SwitchChannelSuggestion` 组件层的 DM/GM 渲染兼容分支保留，避免扩大影响；当前搜索路径不会再传入 DM/GM
- `switchToChannel()` 中 DM/GM 跳转分支保留，供其他入口继续使用
- 底层频道、DM、GM、用户 API/Redux 数据结构均不修改

> 本次只调整「查找频道」弹窗的前端建议列表行为：默认不展示列表，搜索时只返回 public/private 频道。底层 DM/GM 能力和其他入口不受影响。
