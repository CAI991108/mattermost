# 最近提及（@ Mentions）功能移除 - 工作记录

## 功能介绍

### 功能概述

「最近提及」功能允许用户查看**全局所有频道**中包含自己 mention 关键词的历史消息，以右侧面板（RHS）的形式展示。

本质上它是搜索功能的一个**预设参数快捷方式**：用当前用户的 mention 关键词（@username、自定义通知词）作为搜索词，调用通用搜索 API，将结果在 RHS 中以 `isMentionSearch=true` 模式渲染。**没有任何专属后端接口**。

> 注意：这与消息通知系统（红点、未读数、推送）完全无关，两者是独立机制。

---

### 前端入口（共 4 个）

| # | 入口位置 | 组件 / 文件 |
|---|---|---|
| 1 | **页面顶部 @ 按钮** | `global_header/right_controls/at_mentions_button/at_mentions_button.tsx` |
| 2 | **键盘快捷键 Ctrl+Shift+M** | `global_header/center_controls/global_search_nav/global_search_nav.tsx`（全局 keydown 监听） |
| 3 | **移动端汉堡菜单** | `mobile_sidebar_right/mobile_sidebar_right_items/mobile_sidebar_right_items.tsx` |
| 4 | **Popout 弹窗路由** | `rhs_search_popout/rhs_search_popout.tsx`（URL `?mode=MENTION` 参数还原状态） |

---

### 运行逻辑（前端调用链）

```
用户触发任意入口
  → dispatch showMentions()                     [actions/views/rhs.ts:460]
    → getCurrentUserMentionKeys()               获取当前用户 mention 关键词
      （过滤掉 @channel / @all / @here）
    → performSearch(terms, teamId='', true)     [actions/views/rhs.ts:209]
      → 服务端 POST /api/v4/posts/search
        参数：is_or_search=true，每个词用引号精确包裹
    → dispatch UPDATE_RHS_STATE = MENTION       右侧面板切换为「最近提及」视图
      → SearchResults 组件（isMentionSearch=true）
        → PostSearchResultsItem → PostComponent
          → PostMessageContainer (mentionHighlight=true)
            → text_formatting.tsx: highlightCurrentMentions()
```

---

### 后端逻辑

最近提及功能**完全复用通用搜索接口**，无专属后端逻辑：

| 层级 | 文件 | 说明 |
|---|---|---|
| **API 路由** | `server/channels/api4/post.go:38-39` | `POST /api/v4/posts/search`，mention 只是 `is_or_search=true` 的参数区别 |
| **App 层** | `server/channels/app/post.go: SearchPostsForUser()` | 通用搜索逻辑，无 mention 专属分支 |
| **Store 层** | `server/channels/store/sqlstore/post_store.go` | 全文搜索实现 |
| **mention_count** | `server/public/model/channel_member.go` | 频道未读红点字段，与本功能**完全无关** |

> 底层搜索 API 同时服务普通搜索和最近提及，**不能删除**，也**不需要改动**。

---

### 关键词高亮机制

`isMentionSearch=true` 时，`PostMessageContainer` 传入 `mentionHighlight=true`，
经 `text_formatting.tsx: highlightCurrentMentions()` 处理，将匹配 mentionKeys 的文本包裹 `<span class="mention--highlight">`，应用 `mentionHighlightBg` 主题背景色。

注意：`@username` 形式的 at-mention 被优先渲染为蓝色链接 token，不走背景高亮路径，视觉上无背景色。

---

### 快捷键系统结构（三层）

一个快捷键涉及三层，需逐层处理：

| 层级 | 文件 | 内容 |
|---|---|---|
| ① 常量定义 | `keyboard_shortcuts/keyboard_shortcuts_sequence/keyboard_shortcuts.ts` | `navMentions: defineMessages(...)` |
| ② 功能触发 | `global_search_nav.tsx` | `keydown` 监听 Ctrl+Shift+M → `showMentions()` |
| ③-A 弹窗展示 | `keyboard_shortcuts_modal/keyboard_shortcuts_modal.tsx` | 弹窗中展示快捷键说明给用户 |
| ③-B Tooltip 展示 | `at_mentions_button.tsx` | 按钮悬停 Tooltip 中展示 Ctrl+Shift+M 提示 |

---

## 本次修改

**目标**：从前端 UI 彻底移除所有「最近提及」入口，底层搜索逻辑和后端接口完全不动。

### 整文件删除

| 文件 | 说明 |
|---|---|
| `global_header/right_controls/at_mentions_button/at_mentions_button.tsx` | 顶部 @ 按钮组件 |
| `global_header/right_controls/at_mentions_button/at_mentions_button.test.tsx` | 对应测试文件 |
| `global_header/right_controls/at_mentions_button/__snapshots__/at_mentions_button.test.tsx.snap` | 对应快照文件 |

### 修改文件

| 文件 | 改动内容 |
|---|---|
| `global_header/right_controls/right_controls.tsx` | 删除 `<AtMentionsButton/>` 组件及 import |
| `global_header/center_controls/global_search_nav/global_search_nav.tsx` | 删除 Ctrl+Shift+M keydown 监听逻辑及所有相关 import，组件大幅简化 |
| `mobile_sidebar_right/mobile_sidebar_right_items/mobile_sidebar_right_items.tsx` | 删除「Recent Mentions」菜单项 JSX 和 `onRecentMentionItemClick` handler |
| `mobile_sidebar_right/mobile_sidebar_right_items/index.tsx` | 删除 `showMentions` action、`isMentionSearch` prop、`getRhsState` 调用，`RHSStates` import 改为只保留 `CloudProducts` |
| `rhs_search_popout/rhs_search_popout.tsx` | 删除 `RHSStates.MENTION` case 分支和 `showMentions` import，`isMentionSearch` prop 改为硬编码 `false` |
| `rhs_card_header/rhs_card_header.tsx` | 删除 `RHSStates.MENTION` case 和 `showMentions` action 调用 |
| `rhs_card_header/index.tsx` | 删除 `showMentions` action 的 import 和 `bindActionCreators` 注册 |
| `rhs_header_post/rhs_header_post.tsx` | 删除两处 `RHSStates.MENTION` case（handleBack switch 和 render switch） |
| `keyboard_shortcuts/keyboard_shortcuts_modal/keyboard_shortcuts_modal.tsx` | 删除弹窗中 `navMentions` 快捷键说明的展示行 |
| `keyboard_shortcuts/keyboard_shortcuts_sequence/keyboard_shortcuts.ts` | 将 `navMentions: defineMessages(...)` 注释掉（符合项目惯例，保留历史记录） |

### 保留不动

- `actions/views/rhs.ts` 中的 `showMentions()`、`performSearch(isMentionSearch)`、`showSearchResults(isMentionSearch)` — 底层 action，无入口调用，是死代码，不影响任何功能
- `search_results/`、`search/`、`post/post_component.tsx` 中所有 `isMentionSearch` prop 传递和渲染逻辑 — 搜索功能的公共代码，与普通搜索共用
- `selectors/rhs.ts`、`sidebar_right/index.ts` 中的 `RHSStates.MENTION` 判断 — 底层 selector，永远不会返回 `true`，无副作用
- `rhs_search_popout/title.ts` 中的 `RHSStates.MENTION` case — Popout 标题映射，永远不会被触发
- `global_threads/global_threads.tsx` 中的 `RHSStates.MENTION` 判断 — 线程组件 RHS 状态判断，无副作用
- 服务端所有代码（API、App 层、Store 层）— 完全未动

> 底层搜索设施完整保留。如需在新位置重新引入入口，dispatch `showMentions()` 即可，无需重新开发。
