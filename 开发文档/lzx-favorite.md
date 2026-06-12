# 收藏功能移除 - 工作记录

## 收藏功能介绍

### 功能概述

收藏（Favorite）功能允许用户将常用频道标记为收藏，收藏后的频道会出现在左侧边栏的 **FAVORITES** 分类中。

底层存储：通过用户偏好（Preferences）实现，`category: 'favorite_channel'`，`name: channelId`，`value: 'true'`。

### 入口（共 4 个）

| # | 入口位置 | 组件 | 文件路径 |
|---|---|---|---|
| 1 | **频道顶部星标按钮** | `ChannelHeaderTitleFavorite` | `channel_header/channel_header_title_favorite.tsx` |
| 2 | **频道头部下拉菜单** | `MenuItemToggleFavoriteChannel` | `channel_header_menu/menu_items/toggle_favorite_channel.tsx` （仅移动端 `isMobile` 显示） |
| 3 | **左侧栏频道右键菜单** | `SidebarChannelMenu` | `sidebar/sidebar_channel/sidebar_channel_menu/sidebar_channel_menu.tsx` |
| 4 | **频道信息面板（RHS）** | `ChannelInfoRhs → TopButtons` | `channel_info_rhs/top_buttons.tsx` |
| 5 | **频道 Intro 消息** | `createFavoriteButton` | `post_view/channel_intro_message/channel_intro_message.tsx` （频道首条消息底部的动作按钮区） |

### 背后逻辑

1. 用户点击任意入口 → dispatch `favoriteChannel(channelId)` 或 `unfavoriteChannel(channelId)`
2. Action 发起 API 请求，将频道移入/移出服务端的 FAVORITES 分类（`mattermost-redux/actions/channels.ts`）
3. Redux 更新后，selector `isCurrentChannelFavorite` / `isFavoriteChannel` 重算
4. 左侧栏 `sidebar_list.tsx` 渲染所有分类时，**服务端始终会下发 FAVORITES 分类对象**，有收藏频道时该分类有内容；无收藏时，原代码通过空检测 `return null` 隐藏

### 左侧栏 FAVORITES 分类特点

- 服务端**始终下发** FAVORITES 分类（即使用户没有任何收藏）
- 原代码在 `sidebar_category.tsx` 里判断：`if (category.type === CategoryTypes.FAVORITES && !channelIds?.length) return null`（无频道时不渲染）
- 收藏的频道（公频/私频/DM/GM 均可）从原分类移动到 FAVORITES 分类显示

---

## 本次修改

目标：从前端 UI 彻底移除收藏入口，保留底层 action/selector（不影响服务端数据同步）。

### 整文件删除

| 文件 | 说明 |
|---|---|
| `channel_header/channel_header_title_favorite.tsx` | 顶部星标按钮完整组件 |
| `channel_header_menu/menu_items/toggle_favorite_channel.tsx` | 下拉菜单收藏菜单项组件 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `channel_header_title.tsx` | 移除 import 和两处 `<ChannelHeaderTitleFavorite/>` 引用 |
| `channel_header.tsx` | 移除无用的 `toggleFavoriteRef` 残留属性 |
| `channel_header_menu.tsx` | 移除 `isCurrentChannelFavorite` selector 和向三个子菜单的 `isFavorite` 传参 |
| `channel_header_direct_menu.tsx` | 移除 `isFavorite` prop 和移动端收藏菜单项 |
| `channel_header_group_menu.tsx` | 移除 `isFavorite` prop 和移动端收藏菜单项 |
| `channel_header_public_private_menu.tsx` | 移除 `isFavorite` prop 和移动端收藏菜单项 |
| `channel_info_rhs/index.ts` | 移除 mapState 中的 `isFavorite`，mapDispatch 中的 `favoriteChannel/unfavoriteChannel` |
| `channel_info_rhs/channel_info_rhs.tsx` | 移除 `isFavorite` prop、`toggleFavorite` 函数、传给 TopButtons 的相关参数 |
| `channel_info_rhs/top_buttons.tsx` | 移除收藏按钮 UI（保留静音、添加成员、复制链接按钮） |
| `sidebar_channel_menu/index.ts` | 移除 `isFavorite`、`favoriteChannel`、`unfavoriteChannel` 的连接 |
| `sidebar_channel_menu.tsx` | 移除 `favoriteItem` / `favoriteUnfavoriteMenuItem` 整块逻辑和 JSX |
| `channel_move_to_sub_menu/index.tsx` | 移除 FAVORITES 分类的特殊文本和图标处理；在 `filterCategoriesBasedOnChannelType` 函数和混合类型分支中过滤掉 FAVORITES，使其不出现在「移动至」子菜单列表里 |
| `sidebar_list.tsx` | 过滤时同时排除 FAVORITES 分类（`c.type !== CategoryTypes.FAVORITES`），使其完全不进入渲染 |
| `sidebar_category.tsx` | 保留 `categoryNames.favorites` 条目（防止意外渲染时崩溃），移除空检测提前返回 null 的逻辑 |
| `channel_intro_message/index.ts` | 移除 `isFavorite`、`favoriteChannel`、`unfavoriteChannel` 的连接 |
| `channel_intro_message.tsx` | 移除 `isFavorite` prop、`toggleFavorite` 方法、`createFavoriteButton` 函数及所有调用点；清理 `StarIcon`、`StarOutlineIcon`、`WithTooltip` import |

### 保留不动

- `mattermost-redux/actions/channels.ts` 中的 `favoriteChannel` / `unfavoriteChannel` action
- `mattermost-redux/selectors/entities/channels.ts` 中的 `isFavoriteChannel` / `isCurrentChannelFavorite` selector
- `mattermost-redux/constants/channel_categories.ts` 中的 `CategoryTypes.FAVORITES` 常量
- `actions/views/channel.ts` 和 `actions/command.ts` 中离开频道时自动取消收藏的逻辑（数据清理，保留无副作用）

> 底层设施完整保留，如需在新位置重新引入收藏入口，dispatch 现有 action 即可，无需重新开发。

### 崩溃修复说明

移除过程中遇到一个运行时崩溃：服务端**始终下发** FAVORITES 分类对象，`sidebar_category.tsx` 渲染时会查 `categoryNames[category.type]`。初版删掉了 `categoryNames.favorites` 导致 `undefined.id` 崩溃。

最终方案：
1. `sidebar_list.tsx` 过滤时排除 FAVORITES（根本解决，FAVORITES 不进入渲染）
2. `sidebar_category.tsx` 恢复 `categoryNames.favorites`（兜底保护）
