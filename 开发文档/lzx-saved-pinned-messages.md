# 保存的消息 vs 标记的消息 - 工作记录

## 一、功能对比与结论

### 两个功能的设计定位

Mattermost 同时存在两个"保存消息"语义的功能，容易混淆：

| 维度 | 保存的消息（Saved / Flag） | 标记的消息（Pinned） |
|---|---|---|
| **用户可见范围** | 仅自己可见 | 频道所有成员可见 |
| **操作权限** | 任何成员均可操作 | 需要频道管理员权限 |
| **数据归属** | 用户的 Preferences 表 | Post 实体本身的 `is_pinned` 字段 |
| **存储范围** | 跨全部团队/频道的平铺列表 | 严格绑定到单个频道 |
| **计数徽章** | 无 | 有（频道头部图钉数字） |
| **切换频道时 RHS** | 内容不变 | 自动更新为新频道的 pinned posts |

### 结论

- **标记的消息（Pin）**：管理员行为，相当于"频道公告栏/置顶"，对频道所有人可见，本质是修改 Post 实体本身。
- **保存的消息（Saved/Flag）**：个人行为，相当于"私人书签"，仅自己可见，本质是写入用户自己的 Preferences。

两者虽然都是"把某条消息标记一下"，但面向场景完全不同。本次决定**移除"保存的消息"的所有 UI 入口**，底层代码先保留。

---

## 二、保存的消息 - 底层实现

### 存储机制

Flag/Save 操作不修改 Post，而是写入当前用户的 **Preferences 表**：

```
category: 'flagged_post'
name: postId
value: 'true'
```

### API 路由

```
保存消息:  PUT  /api/v4/users/{userId}/preferences
取消保存:  POST /api/v4/users/{userId}/preferences/delete
获取列表:  GET  /api/v4/users/{userId}/posts/flagged
```

### Redux Store 结构

```
// reducers/entities/search.ts
flagged: string[]   // 全局平铺数组，所有频道的保存消息混在一起
// 对比 Pin 是按频道隔离的字典：
pinned: Record<string, string[]>  // { channelId: [postId, ...] }
```

### 核心 Action 链路

```
UI 入口（5 个，见下节）
    ↓
actions/post_actions.ts → flagPost() / unflagPost()
    ↓ 同时处理：若 RHS 当前显示保存列表，同步更新列表
packages/mattermost-redux/actions/posts.ts → flagPost() / unflagPost()
    ↓
dispatch(savePreferences / deletePreferences)
    ↓ API 调用
PUT/POST /api/v4/users/{userId}/preferences[/delete]
```

### 如需后续完整移除，需清理的底层文件

| 文件 | 内容 |
|---|---|
| `packages/mattermost-redux/src/actions/posts.ts` | `flagPost()` / `unflagPost()` 函数 |
| `packages/mattermost-redux/src/actions/search.ts` | `getFlaggedPosts()` 函数 |
| `packages/mattermost-redux/src/reducers/entities/search.ts` | `flagged` reducer |
| `packages/mattermost-redux/src/selectors/entities/posts.ts` | `isPostFlagged()` selector |
| `packages/mattermost-redux/src/constants/preferences.ts` | `CATEGORY_FLAGGED_POST: 'flagged_post'` 常量 |
| `actions/post_actions.ts` | `flagPost()` / `unflagPost()` 包装函数 |
| `actions/views/rhs.ts` | `showFlaggedPosts()` 函数 |
| `components/search_results/search_results.tsx` | `isFlaggedPosts` 相关展示逻辑 |
| `components/search/` | `isFlaggedPosts` 相关 props |
| `components/sidebar_right/index.ts` | `isSavedPosts` 状态映射 |
| `components/rhs_search_popout/` | FLAG 状态相关 case |
| `components/global_header/right_controls/saved_posts_button/` | 整个组件目录（现已无处引用） |
| `components/post_view/post_flag_icon/` | 整个组件目录（现已无处引用） |
| `utils/constants.tsx` | `RHSStates.FLAG: 'flag'` 常量 |
| `platform/client/src/client4.ts` | `getFlaggedPosts()` Client 方法 |

---

## 三、本次修改

### 策略

**仅删除 UI 入口，底层 action / selector / reducer / API 全部保留。**  
如需在新位置重新添加"保存消息"入口，dispatch 现有 action 即可，无需重新开发。

### 删除的入口（共 5 个）

| # | 入口位置 | 触发方式 |
|---|---|---|
| 1 | 全局顶部导航栏书签按钮（桌面端） | 点击书签图标，打开/关闭 Saved messages 面板 |
| 2 | 消息悬浮工具栏书签图标（桌面端 hover 时） | 鼠标悬停消息，工具栏出现的书签按钮 |
| 3 | 消息「···」点菜单 → Save Message 菜单项（含快捷键 S） | 三点菜单操作及键盘快捷键 |
| 4 | 移动端侧边栏 → Saved messages 菜单项 | 移动端汉堡菜单 |
| 5 | 全局线程列表（左侧面板）→ 线程菜单 Save/Unsave 按钮 | 线程右侧「···」菜单 |

### 修改文件清单

| 文件 | 改动说明 |
|---|---|
| `global_header/right_controls/right_controls.tsx` | 移除 `<SavedPostsButton/>` 及其 import |
| `post/post_options.tsx` | 移除 `PostFlagIcon` import、`isFlagged` prop、`flagIcon` 变量及两处渲染 |
| `post/post_component.tsx` | 移除 `isFlagged` / `isFlaggedPosts` props、`post--pinned-or-flagged` 中的 flag 条件、频道名展示中的 flaggedPosts 条件、向 `PostPreHeader` 传入的 flag 相关参数 |
| `post/index.tsx` | 移除 `isPostFlagged` import、`isFlagged` 映射、`isFlaggedPosts` 映射 |
| `post_view/post_pre_header/post_pre_header.tsx` | 整体简化：移除 `isFlagged`、`skipFlagged`、`FlagIconFilled`、`PostPinnedOrFlagged` enum、`getPostStatus`/`getMessageInfo` 方法，仅保留 Pin 逻辑 |
| `post_view/post_pre_header/index.ts` | 移除 `showFlaggedPosts` 注入 |
| `dot_menu/dot_menu.tsx` | 移除 `BookmarkIcon`/`BookmarkOutlineIcon` import、`isFlagged` prop、`handleFlagMenuItemActivated` 方法、`removeFlag`/`saveFlag` 变量、`showSave` 条件及整个 Save 菜单项、键盘快捷键 `S` 的 case、`firstSectionHasItems` 中的 `showSave` |
| `dot_menu/index.ts` | 移除 `flagPost`/`unflagPost` 的 import 和 `bindActionCreators` 注入 |
| `mobile_sidebar_right/mobile_sidebar_right_items/mobile_sidebar_right_items.tsx` | 移除 `onShowFlaggedPostItemClick` 方法和 flaggedPosts 菜单项 |
| `mobile_sidebar_right/mobile_sidebar_right_items/index.tsx` | 移除 `showFlaggedPosts` 的 import 和注入 |
| `threading/global_threads/thread_menu/thread_menu.tsx` | 移除 `flagPost`/`unflagPost`/`isPostFlagged` import、`isSaved` selector、Save/Unsave 菜单项 |
| `rhs_card_header/rhs_card_header.tsx` | 移除 `showFlaggedPosts` action 类型声明、`case RHSStates.FLAG` 返回逻辑、FLAG title 分支 |
| `rhs_card_header/index.tsx` | 移除 `showFlaggedPosts` 的 import 和注入 |

### 保留不动

- `packages/mattermost-redux/src/actions/posts.ts` 中的 `flagPost()` / `unflagPost()`
- `packages/mattermost-redux/src/actions/search.ts` 中的 `getFlaggedPosts()`
- `packages/mattermost-redux/src/reducers/entities/search.ts` 中的 `flagged` reducer
- `packages/mattermost-redux/src/selectors/entities/posts.ts` 中的 `isPostFlagged()`
- `actions/views/rhs.ts` 中的 `showFlaggedPosts()`
- `components/global_header/right_controls/saved_posts_button/` 整个组件目录（现已无处引用，但文件保留）
- `components/post_view/post_flag_icon/` 整个组件目录（现已无处引用，但文件保留）
- `platform/client/src/client4.ts` 中的 `getFlaggedPosts()`、所有 Preferences 相关 API

> 底层设施完整保留，如需重新添加"保存消息"功能入口，dispatch 现有 `flagPost()` / `unflagPost()` action 即可，无需重新开发后端或 Redux 层。
