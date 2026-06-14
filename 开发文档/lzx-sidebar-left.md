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
