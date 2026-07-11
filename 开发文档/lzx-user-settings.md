# 用户设置精简 - 工作记录

## 一、背景与目标

### 1. 原始设置弹窗结构

Mattermost 原始设置弹窗分为两组入口：

**设置（Settings）**
- 通知（Notifications）
- 显示（Display）
- 侧栏（Sidebar）— 本次改造之前已注释移除
- 高级（Advanced）

**个人资料（Profile）**
- 个人资料（Profile）
- 安全（Security）

### 2. 改造目标

精简用户可见的设置选项，减少不必要的个性化权限。对于无需用户自主控制的选项，采用后台固定默认值的方式统一配置，不让用户看到也不让用户修改。Profile / Security 两个 Tab 不做改动。

---

## 二、改造原则

每一个需要固定的选项，统一执行四层处理，确保新老用户都无法绕过：

1. **强制覆盖值** — 在状态初始化函数末尾强制覆盖，无视数据库历史记录。
2. **注释保存逻辑** — 注释掉 `handleSubmit` 中对应的 preference 保存，用户改不了，也不写入数据库。
3. **注释 UI 选项** — 注释掉 `render()` 中对应的 JSX，用户打开设置看不到这些项。
4. **注释构建代码** — 完整保留 section 创建代码并注释，方便回退时直接取消注释。

---

## 三、通知 Tab（Notifications）

**文件**：`webapp/channels/src/components/user_settings/notifications/user_settings_notifications.tsx`

### 保留（用户可定制）

| 选项 | 说明 |
|---|---|
| 桌面通知声音 | 纯个人 UX 偏好 |
| 触发通知的关键词 | 合理的个人通知偏好，`@channel` 候选已同步从列表中移除 |

### 固定 + 注释

| 选项 | 固定值 | 说明 |
|---|---|---|
| 桌面和移动端通知 | ALL（所有新消息） | 强制覆盖 `desktop` / `pushActivity`，注释 `DesktopAndMobileNotificationSettings` |
| 邮件通知 | false（关闭） | 系统控制台 5.4 已关，强制覆盖 `enableEmail`，注释 `EmailNotificationSetting` |

### 其他清理

- 移除标题处「深入了解通知」外链（`info` prop 注释保留）
- 移除「排查通知问题」`SendTestNotificationNotice` 组件
- `zh-CN.json` 同步更新 `user.settings.notifications.channelWide` 中文文案，移除 `"@channel"`

---

## 四、显示 Tab（Display）

**文件**：`webapp/channels/src/components/user_settings/display/user_settings_display.tsx`、`display/index.ts`

### 保留（用户可定制）

| 选项 | 说明 |
|---|---|
| 主题 | 核心个性化 |
| 时钟显示 | 12h/24h 个人习惯差异大 |
| 时区 | 影响消息时间戳，保留 |
| 语言 | 多语言支持，保留 |

### 固定 + 注释

| 选项 | 固定值 | 状态字段 |
|---|---|---|
| 团队队友名字显示 | 用户名（`username`） | `teammateNameDisplay` |
| 在线状态显示 | 开启（`true`） | `availabilityStatusOnPosts` |
| 分享上次活跃时间 | 开启（`true`） | `lastActiveDisplay` |
| 图片预览默认显示 | 展开（`false`） | `collapseDisplay` |
| 消息显示 | 标准（`clean`） | `messageDisplay` |
| 频道显示宽度 | 完整宽度（`full`） | `channelDisplayMode` |
| 快捷添加表情回应 | 开启（`true`） | `oneClickReactionsOnPosts` |
| 将表情符号渲染为表情 | 开启（`true`） | `renderEmoticonsAsEmoji`（在 `index.ts` 强制）|

**注**：`submitLastActive`（`show_last_active` 写入 `user.props`）方法体已替换为空实现，防止 UI 注释后恢复时意外触发写入。

---

## 五、高级 Tab（Advanced）

**文件**：`webapp/channels/src/components/user_settings/advanced/user_settings_advanced.tsx`

### 保留（用户可定制）

| 选项 | 说明 |
|---|---|
| Ctrl+Enter 发送消息 | 打字习惯差异大，保留 |
| 查看未读频道时的滚动位置 | 阅读体验偏好，保留 |

### 固定 + 注释

| 选项 | 固定值 | 状态字段 |
|---|---|---|
| 启用消息格式化 | 开启（`true`） | `formatting` |
| 启用加入/离开消息 | 开启（`true`） | `join_leave` |
| 消息草稿与服务器同步 | 开启（`true`） | `sync_drafts` |

**注**：`JoinLeaveSection` 为独立子组件，直接注释掉 JSX 使用，内部保存逻辑不再触发。

---

## 六、本次具体修改文件

| 文件 | 改动说明 |
|---|---|
| `user_settings/notifications/user_settings_notifications.tsx` | 强制覆盖 desktop/pushActivity/enableEmail；注释 DesktopAndMobile/Email/SendTestNotification 组件；移除 info 外链；同步移除 @channel 折叠描述 |
| `user_settings/display/user_settings_display.tsx` | getDisplayStateFromProps 末尾强制覆盖7个字段；注释8个 section 构建代码和 JSX；注释对应 handleSubmit 保存；submitLastActive 替换为空方法 |
| `user_settings/display/index.ts` | renderEmoticonsAsEmoji 强制返回 `'true'` |
| `user_settings/advanced/user_settings_advanced.tsx` | getStateFromProps 强制覆盖3个字段；renderFormattingSection/renderSyncDraftsSection 方法体替换为 return null（含完整注释）；注释 JSX 中 formatting/JoinLeave/syncDrafts |
| `i18n/zh-CN.json` | `user.settings.notifications.channelWide` 移除 `"@channel"` |
