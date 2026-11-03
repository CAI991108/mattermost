# 22 - feat: narrow-shell navigation, three entries and a conversation info page

## 提交信息

- Commit: `392062e3`（本主题首次提交；后续见下方「关联提交」）
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 功能重构
- 范围: ≤1020px 窄屏外壳的入口层与导航

## 简介

窄屏底栏由四个平级入口（消息 / 频道 / 成员 / 通知）改为三个（聊天 / 通知 / 我）。聊天把频道、私信与群聊合成一个按活跃度排序的列表；成员、置顶与文档收进会话信息页，由会话标题进入；个人主页第一次带上底栏。

## 开发目标

原先底栏把同一件事拆成三个入口：消息是私信、频道是频道、成员是当前会话的人，三者本质上都是在找「一个会话或一个人」。同时「我」没有任何入口——要把自己放进个人主页，只能先打开抽屉菜单。

这一轮要达成的结果是：手机上聊天、通知、我各有一个常驻入口；进入会话不再需要猜频道和成员在哪；人数与置顶信息仍然一眼可达。

## 改动范围

- `webapp/channels/src/components/bottom_navigation/`（底栏、三个条目页、键盘让位）
- `webapp/channels/src/selectors/chat_list.ts`（新增，混排列表的选择器）
- `webapp/channels/src/components/channel_layout/center_channel/center_channel.tsx`（团队级通知地址）
- `webapp/channels/src/components/channel_header_menu/`、`mobile_channel_header/`（标题变链接 + 更多菜单）
- `webapp/channels/src/components/channel_members_rhs/`（成员行触摸形态）
- `webapp/channels/src/components/root/root.tsx`、`components/iuin_profile/iuin_profile.scss`（个人主页底栏）
- `webapp/channels/src/root.html`、`webapp/channels/src/sass/`（视口声明、安全区、让位占位）
- `webapp/channels/src/i18n/en.json`

## 实现说明

- 入口归属由地址推导，不存导航状态：`getSelectedEntry(pathname, teamName, currentUsername)` 返回 `chat | notifications | me`，因此后退、刷新与深链都能得到同一个选中态。
- 聊天列表用一条自己的排序规则：活跃时间取最后发言与该频道建立时间的较大者，私信与群聊同列，静音只做标记不隐藏，不做条数上限。
- 会话信息页复用既有的 `/{team}/channels/<identifier>/members` 页面，标题成为进入它的链接，原有的下拉菜单移到标题右侧的更多按钮；私信与群聊仍由头部的信息按钮打开原面板。
- 通知改为团队级地址 `/{team}/mentions`，窄屏直接渲染提及列表，宽屏回到最近读过的会话；底栏的提及计数与地址解耦，未读数仍然是全局的。
- 个人主页在频道外壳之外，因此在自己的路由分支里挂了一份底栏实例，并把它固定在视口底部；页面滚动器本来就预留了 56px，没有再叠一份。
- 安全区一次写全四个方向：底栏背景延伸到手势区、内容留在其上方，窄屏顶部条取顶部安全区，占位高度统一为 `calc(56px + env(safe-area-inset-bottom))`。
- 键盘让位从「仅输入框获得焦点」放宽为「任意可编辑元素获得焦点且视口被压缩」，让位方式仍然是隐藏、禁用点击但保留占位。

## 关联提交

- `392062e3` 三入口底栏与地址推导
- `0f22d070` 混排聊天列表与过滤
- `8134cd4d` 会话信息页与成员行触摸
- `e4113f2c` 团队级通知地址
- `73143730` 个人主页底栏
- 本提交：安全区、键盘让位与本篇文档

## 验证建议

- 360 / 768 / 1020 三档各看一次聊天列表、会话、会话信息页、通知与个人主页，确认没有横向滚动、输入框不被底栏遮挡。
- 带手势区的真机（iOS Safari、Android Chrome）各确认一次：底栏内容位于安全区之上，背景填满手势区。
- 在会话输入框、成员搜索框与个人主页输入框里各聚焦一次，确认底栏让位、收起键盘后回到原位且页面不跳。
- 1021px 起确认底栏不再出现，桌面布局与改动前一致。

## 回退边界

可整主题回退：底栏、聊天列表、会话信息页、通知地址与个人主页底栏互相独立提交，逐个回退都不会留下半截状态。回退后 `/{team}/mentions` 路由会一起消失，需同时回退底栏的通知条目；仅回退个人主页一项不影响其余部分。
