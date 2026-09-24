# 私信改造 - 工作记录


## 一、原始私信功能介绍

### 1. 原始产品形态

Mattermost 原始私信并不是一个独立的全局模块，而是团队频道体系中的特殊 Channel。

- DM：一对一私信，Channel 类型为 `D`。
- GM：多人私信，Channel 类型为 `G`。
- DM/GM 原本显示在团队左侧栏的 `DIRECT_MESSAGES` 分类下。
- 私信仍然进入普通频道消息区，和公开频道、私有频道共用 `currentChannel`、PostView、RHS 等逻辑。

### 2. 原始前端入口

原始私信入口比较分散，主要包括：

- 左侧栏 `DIRECT_MESSAGES` 分类。
- 左侧栏加号或菜单触发 `MoreDirectChannels` 弹窗。
- `Ctrl/Cmd + Shift + K` 快捷键打开私信弹窗。
- 用户 Profile Popover 中的 Message 按钮。
- 成员列表、用户列表、用户组成员列表中的私信入口。
- GM 的 Add People / Add Members 相关入口。

### 3. 原始前端路由与状态逻辑

- 私信仍走团队频道路由：`/:team/channels/:channel`。
- 打开 DM/GM 后，DM/GM 会成为 `currentChannel`。
- DM/GM 可能被写入团队的 last viewed channel，导致从私信回团队时恢复到 DM。
- RHS 的 Channel Info、Members、Pinned Posts、Files 与普通频道共用一套显示逻辑。
- 普通频道 unread selector 中会混入 DM/GM。

### 4. 原始后端/数据逻辑

本次没有改后端。原始后端/数据模型仍然保留：

- DM/GM 本质都是 Channel。
- DM channel name 由两个 userId 组合。
- GM 依赖 channel members / profiles。
- 打开一对一私信依赖 `openDirectChannelToUserId`。
- 打开多人私信依赖 `openGroupChannelToUserIds`。
- 未读数仍来自 channel membership / unread state。

## 二、改造后的逻辑

### 1. 改造目标

本次改造目标是把私信从“团队左侧栏中的一种频道分类”改造成“全局私信模块”。

- 私信入口固定在 TeamSidebar 中。
- 私信页面不依赖当前 team。
- 团队左侧栏不再显示 `DIRECT_MESSAGES` 分类。
- 一对一私信统一跳转到 `/direct_messages/@username`。
- 不再提供 GM 创建、搜索候选、加人、扩容入口。

### 2. 新路由逻辑

- 新增 `/direct_messages`。
- 新增 `/direct_messages/:identifier?`。
- 支持 `/direct_messages/@username`。
- `DirectMessagesController` 接管私信页面整体布局。
- 无 team 场景下，PostView、RHS、ChannelIdentifierRouter 需要适配 DM 加载逻辑。

### 3. 新页面结构

- TeamSidebar：展示固定“私信”入口和未读 badge。
- DirectMessagesSidebar：展示查找成员入口、未读联系人分组、最近聊天联系人、未读数和选中状态，不再展示“全部成员”列表。
- DirectMessagesCenter：负责私信页中间消息区、默认联系人选择和 `/direct_messages/@username` URL 规范化。
- DmContactItem：负责单个联系人项展示。
- RHS：继续复用原频道 RHS 能力，但允许 DM/GM 在无 team 场景下显示。

### 4. 新交互逻辑

- 点击 TeamSidebar 私信按钮进入 `/direct_messages`，等待 DM channels/memberships 初始化完成后跳转到默认联系人。
- 系统默认跳转统一使用 `/direct_messages/@username`；plain userId URL 仅作为兼容解析保留。
- 搜索用户后点击，打开一对一 DM 并跳转 `/direct_messages/@username`。
- 查找成员弹窗刚打开时不展示成员列表，输入成员名称、用户名或邮箱后才搜索全局用户。
- 私信侧栏参考频道未读分组逻辑：有未读消息的 DM 会进入“未读”分组，并从“最近聊天”中临时移出；确认已读并切换到其它私信后再回到“最近聊天”。
- DM 不再污染团队 last viewed channel。
- 回到团队时恢复团队频道，而不是恢复到 DM channel。
- GM 底层数据不迁移、不删除，但 UI 不再暴露新增或扩容入口。

## 三、本次具体修改内容

### 1. 路由与顶层布局

- `webapp/channels/src/components/root/root.tsx`
  - 新增 `/direct_messages/:identifier?` 登录态路由。
  - 将该路由挂载到 `DirectMessagesController`。

- `webapp/channels/src/components/direct_messages_controller/index.ts`
  - 新增私信控制器导出入口。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_controller.tsx`
  - 新增全局私信页顶层布局。
  - 复用 `ResizableLhs`、`channel_view`、`inner-wrap` 等频道布局结构。
  - 根据 LHS/RHS 打开状态添加 `move--right`、`move--left`。
  - 进入 `/direct_messages` 时调用 `fetchAllMyTeamsChannels()` 和 `fetchAllMyChannelMembers()`，补齐最近聊天依赖的 DM channels 和 channel memberships。
  - 维护 `channelsLoaded` 状态并传给 `DirectMessagesCenter`，避免无 identifier 默认跳转早于基础 DM 数据初始化。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_controller.scss`
  - 新增全局私信页布局样式。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_center.tsx`
  - 新增私信中间消息区控制逻辑。
  - 根据路由 identifier 解析目标用户并打开 DM。
  - 没有 identifier 时等待 `channelsLoaded` 后再计算默认联系人，避免 DM 数据未加载完成时 fallback 到当前用户。
  - 默认跳转统一规范为 `/direct_messages/@username`；如果默认 target 的 profile 未缓存，则先按 userId 获取用户资料，再取 username 跳转。
  - plain userId URL 仅保留为兼容解析，不再作为系统默认跳转输出。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.tsx`
  - 新增私信左侧联系人栏。
  - 展示查找成员入口、未读联系人分组、最近聊天联系人、未读数和当前选中状态，不再展示“全部成员”。
  - 删除进入页面时的全量用户资料预加载，不再调用 `getProfiles`、`getTotalUsersStats` 或按页补齐全部成员。
  - 最近聊天采用 DM-first：先从 `getDmUnreadByUserId` 筛选有历史 DM 的 userId，按 `lastPostAt` 排序取最近 20 个，再通过 `getMissingProfilesByIds` 按需补用户资料。
  - 未读分组基于 `getDmUnreadByUserId` 中 `unread > 0` 的 DM 联系人生成，并从“最近聊天”中临时过滤，避免同一联系人重复出现在两个分组。
  - 参考频道 `lastUnreadChannel` 的展示思路，在组件内维护 `lastUnreadDmUserId`：点击未读私信进入后，即使底层 unread 自动清零，该联系人仍暂留在“未读”分组；切换到其它私信后再按新目标的进入前未读状态重新计算并归位。
  - 当前 active 用户不在最近 20 个联系人或未读联系人中时，仍会按需加载并显示高亮。
  - 将侧栏标题“私信”、搜索入口“查找成员”、分组标题“未读 / 最近聊天”改为 `FormattedMessage` / `intl.formatMessage`，避免 UI 文案硬编码中文。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.scss`
  - 新增私信联系人栏样式、搜索区域样式、未读 badge 样式。

- `webapp/channels/src/components/direct_messages_controller/dm_contact_item.tsx`
  - 新增联系人列表项组件。
  - 展示头像、用户名、最后消息时间、未读数、active 状态。

### 2. TeamSidebar 私信入口

- `webapp/channels/src/components/team_sidebar/team_sidebar.tsx`
  - 在团队按钮列表上方新增全局私信入口。
  - 私信路由下不高亮任何团队按钮。
  - 单团队场景也保持 TeamSidebar 显示，确保用户能进入私信模块。

- `webapp/channels/src/components/team_sidebar/index.ts`
  - 注入全局 DM 未读数，供私信按钮展示 badge。

- `webapp/channels/src/components/team_sidebar/components/dm_sidebar_button.tsx`
  - 新增 TeamSidebar 私信按钮组件。
  - 点击跳转 `/direct_messages`。
  - 根据当前路由显示 active 状态，根据未读数显示 badge。
  - 将 tooltip title 和 `aria-label` 从硬编码“私信”改为复用 `direct_messages.sidebar.title`，确保可访问性文案也走 i18n。

- `webapp/channels/src/components/team_sidebar/components/dm_sidebar_button.scss`
  - 新增私信按钮图标、分隔线、未读 badge 等样式。

### 3. 团队左侧栏清理

- `webapp/channels/src/components/sidebar/sidebar.tsx`
  - 移除旧 `MoreDirectChannels` modal 的 Sidebar 入口。
  - 删除 `showDirectChannelsModal` 状态和打开/关闭逻辑。

- `webapp/channels/src/components/sidebar/sidebar_list/sidebar_list.tsx`
  - 过滤 `CategoryTypes.DIRECT_MESSAGES`，不再渲染旧私信分类。
  - 移除 `Ctrl/Cmd + Shift + K` 打开旧私信弹窗逻辑。

- `webapp/channels/src/components/sidebar/sidebar_category/sidebar_category.tsx`
  - 删除旧 DIRECT_MESSAGES 分类菜单逻辑。
  - 删除 `handleOpenDirectMessagesModal`、旧加号按钮、invite members 残留逻辑。

- `webapp/channels/src/components/sidebar/sidebar_header/sidebar_header.tsx`
  - 移除向 Header 菜单传递打开私信弹窗的回调。

- `webapp/channels/src/components/sidebar/sidebar_header/sidebar_browse_or_add_channel_menu.tsx`
  - 移除菜单中的 “Open a direct message” 项。

- `webapp/channels/src/components/sidebar/sidebar_channel/sidebar_direct_channel/sidebar_direct_channel.tsx`
  - 调整旧 direct channel 项的跳转行为，使其对齐新的私信路由策略。


### 4. MoreDirectChannels 改造

- `webapp/channels/src/components/more_direct_channels/index.ts`
  - 移除 `searchGroupChannels`、`openGroupChannelToUserIds` 注入。
  - 保留用户搜索、用户资料加载、DM 权限检查等一对一私信能力。
  - 用户搜索范围为全局用户，不再依赖当前 team。
  - 无搜索词时 `users = []`，不再通过 `selectProfiles` 默认展示全局成员。
  - 清理 `getProfilesInTeam`、`getCurrentTeam`、`currentTeamId`、`currentTeamName`、`getProfiles`、`getTotalUsersStats` 等旧团队范围和默认加载依赖。

- `webapp/channels/src/components/more_direct_channels/more_direct_channels.tsx`
  - 将弹窗行为从“选择 DM/GM 成员”改为“一对一私信用户搜索”。
  - 搜索时只查询用户，不再查询 GM channel。
  - 打开弹窗时不再默认调用 `getProfiles(0, 100)`，也不再获取全局用户总数或执行分页加载。
  - 无搜索词时不展示候选成员；输入搜索词后才调用 `searchProfiles(searchTerm, {})` 搜索全局用户。
  - 提交时只调用 `openDirectChannelToUserId`。
  - 成功后跳转 `/direct_messages/@username`。
  - 移除 GM option 展开为多个用户的逻辑。
  - 增加 `modalSubheaderText`，在标题下方展示与“查找频道”一致风格的操作提示；提示文案使用 `more_direct_channels.help`，`defaultMessage` 保持英文源文案，并通过 `values={{b: (chunks) => <b>{chunks}</b>}}` 渲染快捷键加粗。
  - 引入 `./more_direct_channels.scss`，确保私信查找成员弹窗的局部尺寸和滚动样式进入前端 bundle。

- `webapp/channels/src/components/more_direct_channels/list/index.ts`
  - 候选项只返回用户，不再混入 GM channel。
  - 移除 `getChannelsWithUserProfiles`、GM 搜索过滤、GM 最近会话合并逻辑。
  - 弹窗默认不展示候选成员；候选列表只来自输入搜索词后的用户搜索结果。

- `webapp/channels/src/components/more_direct_channels/list/list.tsx`
  - 适配点击用户后直接触发私信打开。
  - 移除多选/创建 GM 相关交互残留。
  - 移除网络分页相关 prop，不再在弹窗内滚动加载默认成员。
  - 移除搜索框下方硬编码中文空态提示，不再显示“请输入成员名称、用户名或邮箱进行搜索”。
  - 空搜索时结果区域保持空白，提示改由弹窗标题下方 `modalSubheaderText` 承载。
  - 有搜索词但无结果时，复用 `NoResultsIndicator` 的 `NoResultsVariant.Search` 变体，展示与“查找频道”一致的搜索插画、“没有 xxx 的结果”和检查拼写提示。

- `webapp/channels/src/components/more_direct_channels/more_direct_channels.scss`
  - 为查找成员弹窗补充局部样式作用域 `.more-direct-channels-generic-modal`。
  - 将弹窗 `margin-top` 从 `5vh` 对齐为 `calc(50vh - 240px)`，匹配“查找频道”弹窗的视觉位置。
  - 将内部 `.filtered-user-list` 高度设为 `362px`，对齐 `channel-switcher__suggestion-box` 的内容高度。
  - 对 `.more-modal__list` 和 `.more-modal__options` 做局部滚动约束，结果过多时只在成员结果区域内部滚动，不撑大整个弹窗。

- `webapp/channels/src/components/more_direct_channels/list_item/list_item.tsx`
  - 只渲染用户详情 `UserDetails`。
  - 删除 `GMDetails`、GM 人数图标、`useUserIdsInGroupChannel`。

- `webapp/channels/src/components/more_direct_channels/types.ts`
  - `Option` 简化为 UserProfile 扩展类型。
  - 删除 `GroupChannel`、`isGroupChannel`。
  - `optionValue` 的 label 固定使用 username。

- `webapp/channels/src/components/more_direct_channels/more_direct_channels.test.tsx`
  - 删除 GM 打开相关测试。
  - 删除 `openGroupChannelToUserIds`、`searchGroupChannels` mock。
  - 更新 DM 打开后的跳转断言为 `/direct_messages/@username`。

- `webapp/channels/src/components/more_direct_channels/list_item/list_item.test.tsx`
  - 删除 GroupChannel 渲染测试。
  - 只保留用户渲染测试。

- `webapp/channels/src/components/more_direct_channels/list_item/__snapshots__/list_item.test.tsx.snap`
  - 删除 GroupChannel snapshot。

### 5. RHS、Channel Info、Channel Members

- `webapp/channels/src/actions/global_actions.tsx`
  - 切换频道时区分普通频道和 DM/GM。
  - DM/GM 不再写入团队 last channel，避免污染团队恢复逻辑。
  - 普通频道默认打开 Members RHS；DM/GM 默认打开 Channel Info RHS。

- `webapp/channels/src/actions/views/channel.ts`
  - 调整私信跳转逻辑，使打开用户私信时进入新私信路由。

- `webapp/channels/src/components/sidebar_right/sidebar_right.tsx`
  - RHS loading 条件适配无 team 私信路由。
  - DM/GM 的 Channel Info、Pinned Posts、Files 只依赖当前 channel，不强制要求 team。

- `webapp/channels/src/components/rhs_tab_bar/rhs_tab_bar.tsx`
  - 调整 RHS tab 在 DM/GM 场景下的展示逻辑。
  - 避免 DM 下出现不符合新私信体验的成员入口。

- `webapp/channels/src/components/channel_info_rhs/channel_info_rhs.tsx`
  - 调整 Channel Info 在 DM/GM 下的展示。
  - 移除或隐藏 GM 加人相关入口。

- `webapp/channels/src/components/channel_info_rhs/top_buttons.tsx`
  - 调整顶部按钮逻辑，避免 DM/GM 暴露新增成员入口。

- `webapp/channels/src/components/channel_members_rhs/channel_members_rhs.tsx`
  - 调整成员 RHS 在 DM/GM 场景下的行为。
  - 避免通过成员 RHS 继续扩容 GM。

- `webapp/channels/src/components/channel_members_rhs/channel_members_rhs.scss`
  - 增加成员项点击区域、DM 未读 badge 等样式。
  - 调整成员列表布局，适配私信联系人展示。

- `webapp/channels/src/components/channel_members_rhs/index.ts`
  - 为成员 RHS 注入 DM unread、last post 等数据。
  - 调整 DM/GM 场景下的 actions 和 props。

- `webapp/channels/src/components/channel_members_rhs/member.tsx`
  - DM 场景下成员信息点击可以打开对应一对一私信。
  - 增加 DM 未读 badge 展示。
  - 将头像 popover 与成员信息点击区域拆开，避免交互冲突。

- `webapp/channels/src/components/channel_members_rhs/member_list.tsx`
  - 为成员项类型增加 `dmUnreadCount`、`dmLastPostAt` 字段。

### 6. 删除 GM/Add Members 入口

- `webapp/channels/src/components/channel_header_menu/menu_items/add_group_members.tsx`
  - 删除文件。
  - 原功能用于给 GM 添加成员，本次不再提供 GM 扩容入口。

- `webapp/channels/src/components/channel_header_menu/menu_items/add_group_members.test.tsx`
  - 删除对应测试文件。

### 7. CenterChannel、PostView、路由加载适配

- `webapp/channels/src/components/channel_layout/center_channel/index.ts`
  - 处理历史 last channel 中可能保存 DM channel name 的情况。
  - 如果 last channel 形如 `userId__userId`，回退到团队默认频道。

- `webapp/channels/src/components/channel_layout/channel_identifier_router/actions.ts`
  - 适配 `/direct_messages/@username` 的 channel 查找和加载流程。
  - 确保私信路由可以根据 identifier 打开对应 DM。

- `webapp/channels/src/components/post_view/index.ts`
  - `isChannelLoading` 支持无 team 的 DM route。
  - 当 route 没有 team 且当前 channel 是 DM 时，不再错误判断为 loading。

### 8. selectors、unread、私信联系人排序

- `webapp/channels/src/selectors/direct_messages.ts`
  - 新增全局私信 selector。
  - 负责基于 DM channels 和 channel memberships 计算最近 DM 联系人、未读数、最后消息时间、当前 active user。
  - 为 TeamSidebar 私信按钮和 DirectMessagesSidebar 提供数据。
  - 最近聊天不依赖全量 user profiles；profiles 只在确定最近聊天 userId 后按需加载用于展示头像、昵称和状态。

- `webapp/channels/src/selectors/views/channel_sidebar.ts`
  - 普通频道 unread 列表过滤 DM/GM。
  - 当前 channel 如果是 DM/GM，也不再加入团队 unread channel 列表。

### 9. Profile、成员列表、用户入口跳转

- `webapp/channels/src/components/profile_popover/profile_popover.tsx`
  - Profile Popover 中的发消息入口统一跳转新私信路由。
  - 避免继续进入团队频道路径。

- `webapp/channels/src/components/user_group_popover/group_member_list/group_member_list.tsx`
  - 用户组成员列表中的私信入口改为新路由。

- `webapp/channels/src/components/user_group_popover/group_member_list/index.ts`
  - 清理旧私信 action 注入或旧跳转依赖。

- `webapp/channels/src/components/at_sum_members_mention/notification_from_members_modal.tsx`
  - 成员提醒弹窗中的用户私信入口改为新私信路由。

### 10. 禁用私信 @ 提及

私信（DM/GM）场景下，`@here`、`@channel`、`@all` 语义无效，且弹出"频道成员"候选列表与私信体验不符，因此在 DM/GM 中完全禁用 `@` 候选功能。

实现思路：`Textbox` 是类组件，`suggestionProviders` 数组在构造函数里只初始化一次，不随 props 重建。因此不能在构造时有条件地添加 `AtMentionProvider`（否则频道切换后无法恢复），而是始终注册该 provider，让其在 `handlePretextChanged` 内部感知 `isDMChannel` 并 early return。

- `webapp/channels/src/components/textbox/index.ts`
  - `makeMapStateToProps` 中读取当前 channel type。
  - channel type 为 `D`（DM）或 `G`（GM）时，计算 `isDMChannel = true` 并注入 Redux props。

- `webapp/channels/src/components/textbox/textbox.tsx`
  - Props 增加 `isDMChannel?: boolean`。
  - 构造函数初始化 `AtMentionProvider` 时透传 `isDMChannel`。
  - `updateSuggestions` 中将 `isDMChannel` 加入 `setProps` 调用，确保频道切换时同步更新。

- `webapp/channels/src/components/suggestion/at_mention_provider/at_mention_provider.tsx`
  - `Props` 增加 `isDMChannel?: boolean`。
  - 类字段增加 `public isDMChannel: boolean`，constructor 和 `setProps` 均存储该值。
  - `handlePretextChanged` 开头增加 `if (this.isDMChannel) return false`，DM/GM 场景下直接跳过所有 `@` 候选逻辑。

### 11. 其它辅助修改

- `webapp/channels/src/types/external/scss.d.ts`
  - 新增 SCSS module/type 声明辅助文件，避免样式导入类型报错。

- `webapp/channels/src/i18n/zh-CN.json`
  - 新增 `more_direct_channels.help` 中文翻译，对应查找成员弹窗标题下方操作提示。
  - 新增 `direct_messages.sidebar.title`、`direct_messages.sidebar.find_members`、`direct_messages.sidebar.unreads`、`direct_messages.sidebar.recent_chats` 中文翻译，供私信侧栏与 TeamSidebar 私信入口复用。

### 12. 私信联系人列表三点菜单（静音入口）

私信侧边栏联系人列表使用自定义的 `DmContactItem` 组件，从未包含过三点菜单。本次新增 hover 显示的三点菜单，内含静音/取消静音入口，交互与频道侧边栏三点菜单一致。

- `webapp/channels/src/selectors/direct_messages.ts`
  - `DmUnreadInfo` 类型新增 `channelId: string` 和 `isMuted: boolean` 字段。
  - `getDmUnreadByUserId` selector 在构建每个联系人的 info 对象时同步填充这两个字段（`isChannelMuted(membership)` 来自 `mattermost-redux/utils/channel_utils`）。

- `webapp/channels/src/components/direct_messages_controller/dm_contact_item.tsx`
  - Props 新增 `currentUserId`、`channelId`、`isMuted`。
  - 引入 `DotsVerticalIcon`、`useIntl`、`useState`（菜单开关状态）、`Menu`、`MenuItemToggleMuteChannel`。
  - 在 `__badges` 区域加入 `Menu.Container`，内含 `MenuItemToggleMuteChannel`。
  - unread badge 在菜单打开时隐藏（`!menuOpen`）；父容器新增 `dm-contact-item--menu-open` class。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.tsx`
  - 引入 `getCurrentUserId` selector；新增 `currentUserId` 变量。
  - 两处 `DmContactItem` 渲染均补传 `currentUserId`、`channelId={dmInfo?.channelId ?? ''}`、`isMuted={dmInfo?.isMuted ?? false}`。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.scss`
  - `__badges` 新增 `gap: 4px`。
  - 新增 `__menu-btn` 样式：默认隐藏（`display: none`），hover / active / 菜单开启时显示（`display: flex`），尺寸 24×24，圆角 4px，hover 背景加深。

`MenuItemToggleMuteChannel` 组件本体直接复用，无需修改。

### 13. 静音 DM 视觉灰化与未读行为补完

#### 背景

`calculateUnreadCount` 对静音频道永远返回 `messages = 0`，因为 Redux reducer 在收到 `INCREMENT_UNREAD_MSG_COUNT` 时对静音频道会同步递增 `msg_count`，使差值始终为 0。这导致静音 DM 收到新消息后无法实时进入未读分组、角标也无法实时更新。频道侧栏通过 `getMutedChannelIdsWithMessages`（`channel_sidebar.ts`）使用 `last_post_at > last_viewed_at` 绕过此限制，本次 DM 侧采用相同策略。

#### 已知限制

静音 DM 实时角标只能显示 `1`（有消息的信号），无法实时显示精确计数，退出重进后才从服务端拿到精确数字。这与频道侧栏静音频道的行为一致，属于 Redux 层架构限制，语义上也符合"静音 = 不想被精确计数打扰"。

- `webapp/channels/src/selectors/direct_messages.ts`
  - `getDmUnreadByUserId`：静音 DM 的 `unread` 用原逻辑算得 0 时，fallback 到 `(dmChannel.last_post_at || 0) > (membership.last_viewed_at || 0) ? 1 : 0`，确保静音 DM 有新消息时仍能进入未读分组并显示角标。
  - `getTotalUnreadDMs`：过滤掉 `info.isMuted === true` 的项，静音 DM 的消息不计入 TeamSidebar 私信按钮的总数字角标。

- `webapp/channels/src/components/direct_messages_controller/dm_contact_item.tsx`
  - 根据 `isMuted` prop 给根元素追加 `dm-contact-item--muted` class。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.scss`
  - 新增 `dm-contact-item--muted` modifier：`__avatar-inner`、`__display-name`、`__username`、`__unread-badge` 均设 `opacity: 0.4`，视觉对齐频道侧栏 `.SidebarLink.muted` 的灰化效果。
  - `__unread-badge` 颜色变量从 `--button-bg`/`--button-color` 改为 `--mention-bg`/`--mention-color`，`border-radius` 从 `9px` 改为 `8px`，`font-weight` 从 600 改为 700，与频道侧栏 `.badge` 样式完全对齐。

## 四、保留不动与兼容说明

### 1. 后端不改

本次私信改造只改前端展示、路由、入口和状态组织方式，不改后端模型。

- 未新增后端 API。
- 未修改数据库 schema。
- 未修改 Channel 模型。
- DM/GM 仍然复用 Mattermost 原有 Channel 数据结构。

### 2. GM 兼容边界

本次目标不是删除历史 GM 数据，而是不再从 UI 暴露 GM 新增和扩容能力。

- 不主动创建 GM。
- 不提供 GM 加人入口。
- 不展示 GM 搜索候选。
- 已存在 GM 不删除、不迁移。
- 底层 action/reducer 中 GM 能力不强行删除，避免影响历史数据或隐藏依赖。

### 3. 风险与注意事项

- 无 team route 下，组件不能强依赖 `currentTeam`。
- 历史 localStorage 可能保存过 DM channel name，需要回退到团队默认频道。
- 插件或旧代码如果绕过 UI 直接调用旧 action，仍可能触发 Mattermost 原有 GM 能力。
- 左侧私信栏已移除“全部成员”，最近聊天不再全量加载用户资料；最近聊天依赖 DM channels + memberships，进入 `/direct_messages` 时会补齐这些基础数据。
- 私信“未读”分组的延迟归位逻辑当前在 `DirectMessagesSidebar` 组件内维护，适配从私信侧栏点击进入的主路径；如果未来需要完全覆盖外部 URL 直接进入且 profile 尚未加载的极端时序，可考虑上升到 Redux/action 层实现类似频道 `lastUnreadChannel` 的全局状态。
- 查找成员弹窗默认不加载全局用户；只有输入搜索词后才调用用户搜索。
- 查找成员弹窗的尺寸、位置和滚动行为依赖 `more_direct_channels.tsx` 对 `more_direct_channels.scss` 的 side-effect import；后续调整弹窗样式时需同步确认该局部样式仍被加载且未影响其它 `more-modal`。
- 系统默认私信 URL 统一为 `/direct_messages/@username`；plain userId URL 仅保留兼容解析。
- `/direct_messages/@username` 依赖用户数据加载和 username 解析。
- 私信页面复用频道消息区和 RHS，后续改动频道布局时需要同步验证全局私信路由。

## 五、文档备注

这份文档只记录本次私信改造的前端工作范围。后端 Channel、Member、Unread 等数据结构仍沿用 Mattermost 原始实现。新增的全局私信模块主要通过路由、入口、selector 和 UI 组合方式实现。
