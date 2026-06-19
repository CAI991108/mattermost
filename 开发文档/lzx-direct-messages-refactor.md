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
- DirectMessagesSidebar：展示最近私信联系人、搜索入口、未读数和选中状态。
- DirectMessagesCenter：负责私信页中间消息区和默认联系人选择。
- DmContactItem：负责单个联系人项展示。
- RHS：继续复用原频道 RHS 能力，但允许 DM/GM 在无 team 场景下显示。

### 4. 新交互逻辑

- 点击 TeamSidebar 私信按钮进入 `/direct_messages`。
- 搜索用户后点击，打开一对一 DM 并跳转 `/direct_messages/@username`。
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

- `webapp/channels/src/components/direct_messages_controller/direct_messages_controller.scss`
  - 新增全局私信页布局样式。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_center.tsx`
  - 新增私信中间消息区控制逻辑。
  - 根据路由 identifier 解析目标用户并打开 DM。
  - 没有 identifier 时选择默认联系人或显示空状态。

- `webapp/channels/src/components/direct_messages_controller/direct_messages_sidebar.tsx`
  - 新增私信左侧联系人栏。
  - 展示最近 DM 联系人、未读数、当前选中联系人。
  - 提供搜索/新建一对一私信入口。
  - “全部成员”使用全局用户数据；页面进入时按 `DM_USERS_PAGE_SIZE = 200` 加载第一页用户。
  - 当全局用户数超过 200 时，继续按页调用 `getProfiles` 补齐剩余用户，避免成员列表只显示已缓存用户。

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
  - 用户候选数据改为全局用户范围，不再依赖当前 team。
  - 清理 `getProfilesInTeam`、`getCurrentTeam`、`currentTeamId`、`currentTeamName` 等旧团队范围依赖。

- `webapp/channels/src/components/more_direct_channels/more_direct_channels.tsx`
  - 将弹窗行为从“选择 DM/GM 成员”改为“一对一私信用户搜索”。
  - 搜索时只查询用户，不再查询 GM channel。
  - 默认加载和搜索都走全局用户范围，不再传 `team_id` 或回退到 `getProfilesInTeam`。
  - 提交时只调用 `openDirectChannelToUserId`。
  - 成功后跳转 `/direct_messages/@username`。
  - 移除 GM option 展开为多个用户的逻辑。

- `webapp/channels/src/components/more_direct_channels/list/index.ts`
  - 候选项只返回用户，不再混入 GM channel。
  - 移除 `getChannelsWithUserProfiles`、GM 搜索过滤、GM 最近会话合并逻辑。
  - 弹窗默认候选不再按最近私信优先或只展示最近聊天用户，而是展示全部未删除成员并按用户名排序，方便直接从全部成员中选择。

- `webapp/channels/src/components/more_direct_channels/list/list.tsx`
  - 适配点击用户后直接触发私信打开。
  - 移除多选/创建 GM 相关交互残留。

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
  - 负责计算最近 DM 联系人、未读数、最后消息时间、当前 active user。
  - 为 TeamSidebar 私信按钮和 DirectMessagesSidebar 提供数据。

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

### 10. 其它辅助修改

- `webapp/channels/src/types/external/scss.d.ts`
  - 新增 SCSS module/type 声明辅助文件，避免样式导入类型报错。

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
- 左侧私信栏“全部成员”依赖全局用户加载；当前按 200 人一页预取并在超过 200 人时补齐，后续若用户规模明显增大，需要考虑虚拟列表或滚动分页以降低渲染压力。
- `/direct_messages/@username` 依赖用户数据加载和 username 解析。
- 私信页面复用频道消息区和 RHS，后续改动频道布局时需要同步验证全局私信路由。

## 五、文档备注

这份文档只记录本次私信改造的前端工作范围。后端 Channel、Member、Unread 等数据结构仍沿用 Mattermost 原始实现。新增的全局私信模块主要通过路由、入口、selector 和 UI 组合方式实现。
