# 话题讨论（Threads）改造 - 工作记录

## 一、原始话题功能介绍

### 1. 功能概述

Mattermost 的话题讨论（Threaded Discussions / Collapsed Reply Threads）用于把某条消息下的回复收拢成一个独立线程。

- 普通频道中的根消息可以产生回复线程。
- 用户参与、被提及或自动关注后，该线程会进入“关注的话题”。
- 左侧栏“话题”入口对应 Global Threads / Followed Threads 视图。
- 消息右侧回复图标、三点菜单 Reply、快捷键 Shift+Up 等都可以打开回复线程。

### 2. 系统控制台配置

话题相关配置位于：

```text
System Console → Posts → Threads
/admin_console/site_config/posts
```

主要有两个配置项：

| 配置项 | 配置 key | 说明 |
|---|---|---|
| 自动关注话题 | `ServiceSettings.ThreadAutoFollow` | 必须开启，后端才会启用话题相关数据维护 |
| 话题讨论 | `ServiceSettings.CollapsedThreads` | 控制话题讨论是否允许、默认状态、是否强制开启 |

`ServiceSettings.CollapsedThreads` 可选值：

| 值 | 后台显示 | 含义 |
|---|---|---|
| `disabled` | Disabled | 服务端不允许话题讨论 |
| `default_off` | Enabled (Default Off) | 服务端允许，用户默认关闭，可自行开启 |
| `default_on` | Enabled (Default On) | 服务端允许，用户默认开启，可自行关闭 |
| `always_on` | Always On / 永远开启 | 服务端允许并强制开启，用户不能关闭 |

### 3. 前端启用判断逻辑

原始 selector：

```ts
isCollapsedThreadsEnabled = 服务端允许 && (用户开启 || 服务端 always_on)
```

对应文件：

```text
webapp/channels/src/packages/mattermost-redux/src/selectors/entities/preferences.ts
```

最终本次改造后，仍保留原始逻辑。也就是说：

- 是否强制开启“话题讨论”交给系统控制台的 `always_on` 控制。
- 如果后台设置为“永远开启”，用户设置页不会展示“话题讨论”开关。
- 前端不再额外硬编码强制开启“话题讨论”。

### 4. 用户显示设置

用户个人设置中原本有两个相关项：

| 设置项 | preference | 原始作用 |
|---|---|---|
| 话题讨论 | `collapsed_reply_threads` | 用户是否启用话题讨论 |
| 点击打开话题 | `click_to_reply` | 点击消息正文是否打开回复线程 |

其中“话题讨论”是否允许用户编辑，原始逻辑已经受 `CollapsedThreads.ALWAYS_ON` 控制。

### 5. “关注的话题”列表范围

在某个团队内点击左侧栏“话题”时，列表范围不是全站所有频道话题，而是：

```text
当前团队频道话题 + DM/GM 话题
```

后端查询中，如果没有 `excludeDirect`，会查询：

```text
Threads.ThreadTeamId = 当前 teamId
OR
Threads.ThreadTeamId = ''
```

其中 `ThreadTeamId = ''` 的话题主要对应 DM/GM。

## 二、本次改造目标

### 1. 保持话题入口和列表语义不变

本次不把“话题”改成真正全局入口，也不改变 Followed Threads 的后端查询范围。

- 左侧栏“话题”入口保持在团队内。
- 当前团队话题 + DM/GM 话题的原始数据模型不改。
- 不新增 `excludeDirect` 前端请求参数。

### 2. 通过前端限制避免 DM/GM 产生新话题

因为当前功能尚未上线，不需要处理历史 DM/GM 话题。

本次选择轻量前端方案：

- 不改后端。
- 不处理历史数据。
- 不禁止 API 或移动端创建回复。
- 只在 Web 前端隐藏/禁用 DM/GM 中的回复入口。

### 3. 设置策略

最终策略：

- “话题讨论”本身交给 System Console 配置，后续通过“永远开启”强制用户使用。
- “点击打开话题”前端固定关闭，并从用户显示设置中隐藏。

## 三、本次具体修改内容

### 1. 点击打开话题固定关闭

- `webapp/channels/src/components/post/index.tsx`
  - 将 `clickToReply` 固定为 `false`。
  - 不再读取用户 `Preferences.CLICK_TO_REPLY`。
  - 结果：点击消息正文不会打开回复线程。

- `webapp/channels/src/components/user_settings/display/user_settings_display.tsx`
  - 注释 `clickToReplyPreference` 的创建和保存。
  - 注释 `clickToReply` section 创建。
  - 注释 render 中 `{clickToReply}`。
  - 结果：用户设置 - 显示中不再展示“点击打开话题”。

### 2. 保留话题讨论原始控制逻辑

- `webapp/channels/src/packages/mattermost-redux/src/selectors/entities/preferences.ts`
  - `isCollapsedThreadsEnabled` 保持原始逻辑。
  - 结果：是否强制开启继续由 `ServiceSettings.CollapsedThreads = always_on` 控制。

- `webapp/channels/src/components/user_settings/display/user_settings_display.tsx`
  - “话题讨论”设置项已恢复。
  - 是否展示仍由 `collapsedReplyThreadsAllowUserPreference` 控制。
  - 当后台设置“话题讨论 = 永远开启”时，用户侧不会展示可关闭开关。

### 3. DM/GM 核心回复入口隐藏

- `webapp/channels/src/components/post/index.tsx`
  - 基于 `channel.type` 计算 `isDMorGM`。
  - 将 `isDMorGM` 传给 `PostComponent` / `PostOptions`。

- `webapp/channels/src/components/post/post_component.tsx`
  - `Props` 增加 `isDMorGM?: boolean`。

- `webapp/channels/src/components/post/post_options.tsx`
  - `Props` 增加 `isDMorGM?: boolean`。
  - hover 回复图标 `CommentIcon` 增加 `!props.isDMorGM` 判断。
  - 搜索结果页回复图标也增加 `!props.isDMorGM` 判断。
  - 向 `DotMenu` 传递 `isDMorGM`。

- `webapp/channels/src/components/dot_menu/dot_menu.tsx`
  - `Props` 增加 `isDMorGM?: boolean`。
  - 三点菜单 Reply 项增加 `!this.props.isDMorGM` 判断。

- `webapp/channels/src/components/dot_menu/index.ts`
  - 连接组件 props 增加 `isDMorGM`。

最终效果：

- DM/GM 聊天页不显示 hover 回复图标。
- DM/GM 三点菜单不显示 Reply。
- DM/GM 搜索结果不显示回复图标。
- 普通频道、私有频道回复入口保持不变。

### 4. DM/GM Shift+Up 回复快捷键禁用

- `webapp/channels/src/components/advanced_text_editor/use_key_handler.tsx`
  - 引入 `General`。
  - 根据当前 `channelId` 获取 channel。
  - 判断 `isDMorGM`。
  - 仅在 `!isDMorGM` 时允许空输入框 `Shift+Up` 调用 `replyToLastPost?.(e)`。

最终效果：

- DM/GM 中空输入框按 `Shift+Up` 不再回复最后一条消息。
- 普通频道、私有频道中 `Shift+Up` 保持原行为。
- 快捷键定义和快捷键帮助弹窗未修改，因为该快捷键在频道中仍然有效。

## 四、保留不动

- 后端 API、App 层、Store 层均未修改。
- 不处理历史 DM/GM 话题。
- 不修改 Global Threads / Followed Threads 请求参数。
- 不新增 `excludeDirect=true`。
- 不修改移动端、插件、外部 API 行为。
- 不删除底层 reply/thread action 和 selector。

## 五、最终逻辑结论

最终产品逻辑是：

1. 系统控制台将“话题讨论”设置为“永远开启”后，用户不能关闭话题讨论。
2. Web 前端固定关闭“点击打开话题”，用户不能自行开启。
3. Web 前端在 DM/GM 中隐藏可见回复入口，并禁用空输入框 Shift+Up 回复触发。
4. 普通频道和私有频道的话题讨论能力保持正常。
5. 本次方案属于前端轻量限制，不是后端强约束。
