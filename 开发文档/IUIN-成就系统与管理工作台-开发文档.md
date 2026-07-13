# IUIN 成就系统与管理工作台开发文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档类型 | 业务系统、数据模型与管理工作台开发文档 |
| 当前状态 | 展示、配置、装备与发布工作流已实现；自动判定仍处于设计/演示阶段 |
| 功能基线 | `master` / `d77a216dce` |
| 首次主线实现 | `f4dfbf0f9a` 至 `a49376d5c2` |
| 最近相关提交 | `b1f4da729b`、`1571420b25`、`28495bddfd` |
| 功能范围 | 成就徽章、称号、头像框、用户解锁/装备、个人主页、资料卡、全局头像、荣誉工作台 |
| 更新时间 | 2026-07-11 |

## 2. 摘要

IUIN 成就系统面向研究生、博士生、导师、课题组与科研协作成员，目标是把平台中的研究行为和协作沉淀转化为可展示的荣誉资产。

系统由三个并列子域组成：

- **成就徽章**：用户解锁后可选择最多 10 个精选成就展示。
- **称号**：用户解锁后选择一个当前装备称号。
- **头像框**：用户解锁后选择一个当前装备头像框，以透明中空贴图覆盖头像。

管理端在 Mattermost 登录体系内提供 `/iuin_honors_admin` 工作台，支持定义管理、素材上传与裁剪、草稿、提交、发布、排序和审计。

必须明确当前实现状态：数据库和产品 UI 已具备完整荣誉模型，但“自动根据真实行为判定 200 项成就”的执行引擎尚未完成。当前 API 会通过 `ensureIuinHonorDemoUserState()` 为没有荣誉数据的用户写入演示授权。第一期自动判定方案目前是开发设计文档，不应被描述为已经上线的实时规则引擎。

## 3. 设计原则

### 3.1 领域原则

- 以科研行为、知识沉淀和协作证据为核心，避免“登录 100 天”类纯计数玩法。
- 判定尽量复用 Mattermost 已有行为：发帖、回复、Reaction、Pin、Save、附件、个人主页、README 和夜间扫描。
- 定义表、用户解锁表和当前装备/精选表分离。
- 图片资源由 FileStore 管理，数据库只保存 Storage Key 和业务元数据。
- UI 参考 Discord 的可装备荣誉体验，但保留 IUIN 现有页面语言。
- 头像框采用独立透明贴图覆盖头像，不把头像和边框烘焙成一张图。

### 3.2 管理原则

- 工作台复用 Mattermost Session，不建设第二套登录。
- 编辑过程与正式发布分开：`draft → submitted → published`。
- 发布保留贡献者，发布操作者单独进入审计日志。
- 删除、更新、排序和发布都必须留下可追踪记录。
- 正式定义使用稳定业务 ID，不使用自增 ID 作为跨表语义键。

## 4. 总体架构

```text
研究行为 / 管理员定义
          │
          ├─ 当前：Demo Grant
          └─ 规划：事件判定器 / Nightly Scan
                       │
                       v
定义表 ------------------------- 用户拥有表
IuinAchievements                IuinUserAchievements
IuinTitles                      IuinUserTitles
IuinAvatarFrames                IuinUserAvatarFrames
       │                                  │
       └──────────────┬───────────────────┘
                      v
                用户展示配置
          IuinFeaturedAchievements
          IuinUserTitleLoadouts
          IuinUserAvatarFrameLoadouts
                      │
          ┌───────────┼────────────┐
          v           v            v
       个人主页     Profile Card   全局 Avatar

荣誉工作台
  ├─ Definition CRUD / Reorder
  ├─ Asset Upload / Crop
  ├─ Draft
  ├─ Submission
  ├─ Publish
  └─ Audit
```

## 5. 数据模型

核心迁移：

- `000186_create_iuin_honors`
- `000187_update_iuin_achievement_icon_storage_keys`
- `000188_update_iuin_title_icon_storage_keys`
- `000189_update_iuin_title_game_icon_storage_keys`
- `000191_create_iuin_honor_admin_audits`
- `000192_add_iuin_honor_admin_drafts_and_contributors`
- `000193_update_iuin_avatar_frame_image_assets`
- `000194_drop_iuin_avatar_frame_style_payload`
- `000195_drop_iuin_honor_css_icon_fields`
- `000196_add_iuin_title_frame_categories`
- `000197_add_iuin_honor_admin_draft_status`

### 5.1 定义表

#### IuinAchievements

保存成就定义：

- `Id`：稳定业务 ID。
- `Name/Description`：名称与说明。
- `IconStorageKey`：徽章图标。
- `Category`：`profile`、`experiment`、`meeting`、`literature`、`collaboration` 等。
- `Rarity`：`common`、`rare`、`epic`、`hidden`。
- `UnlockHint`：解锁提示。
- `SortOrder`：工作台及前端顺序。
- `ContributorUserId/ContributorUsername`：贡献者。
- `CreateAt/UpdateAt/DeleteAt`：生命周期。

#### IuinTitles

结构与成就类似，使用 `IconStorageKey` 指向称号图片。`000195` 后称号也具有 `Category`。

#### IuinAvatarFrames

- `FrameStorageKey`：实际覆盖头像的透明贴图。
- `PreviewStorageKey`：预览图，可与 Frame Key 相同。
- `Category/Rarity/UnlockHint/SortOrder`：分类、稀有度、提示和顺序。

历史上荣誉使用过 `StylePayload`、`IconName` 和 CSS 生成视觉。`000193`、`000194` 已删除这些旧字段；当前视觉以图片 Storage Key 为准，后续不得重新依赖旧 CSS Payload。

### 5.2 用户拥有表

| 表 | 关键字段 | 用途 |
|---|---|---|
| `IuinUserAchievements` | `UserId`、`AchievementId`、`UnlockedAt`、`EvidenceType`、`EvidenceId`、`Payload` | 记录成就解锁及证据 |
| `IuinUserTitles` | `UserId`、`TitleId`、`GrantType`、`GrantSourceId`、`GrantedAt` | 记录称号授予 |
| `IuinUserAvatarFrames` | `UserId`、`AvatarFrameId`、`GrantType`、`GrantSourceId`、`GrantedAt` | 记录头像框授予 |

活动记录都使用条件唯一索引，软删除后允许重新授予。

### 5.3 展示配置表

| 表 | 用途 |
|---|---|
| `IuinFeaturedAchievements` | 用户选择的精选成就及顺序，最多 10 个 |
| `IuinUserTitleLoadouts` | 当前装备称号，每个用户至多一条活动记录 |
| `IuinUserAvatarFrameLoadouts` | 当前装备头像框，每个用户至多一条活动记录 |

### 5.4 工作台表

#### IuinHonorAdminDrafts

保存投稿者的草稿和提交内容：

- `OwnerUserId/OwnerUsername`
- `Kind`：`achievements`、`titles`、`avatar_frames`
- `Status`：`draft` 或 `submitted`
- 定义字段与素材 Storage Key
- `CreateAt/UpdateAt/DeleteAt`

最终发布不会把草稿表当正式定义表使用，而是把提交内容写入对应正式表。

#### IuinHonorAdminAudits

保存：

- 操作者。
- 动作类型。
- 目标类型与目标 ID。
- 摘要。
- 修改前/后 Payload。
- 操作时间。

## 6. 资源存储

逻辑 Storage Key 使用：

```text
profile/honors/achievements/{achievement_id}/icon.png
profile/honors/titles/{title_id}/title-game.png
profile/honors/avatar_frames/{frame_id}/frame.png
```

本地 FileStore 当前物理位置：

```text
mattermost/server/data/profile/honors/...
```

工作台上传的动态文件名可能包含随机后缀，但正式定义只保存最终 Storage Key。

### 6.1 图片处理

- 头像框目标画布为 `512 × 512`。
- 成就图片目标画布为 `512 × 512`。
- 称号图片支持横向目标尺寸，当前工作台使用 `640 × 200` 预裁剪路径。
- 非 GIF 图片优先在浏览器端 Canvas 预裁剪，避免原图在进入编辑流程前被服务端 10 MiB 限制拒绝。
- GIF 保留服务端处理路径，避免 Canvas 丢失动画帧。
- 头像框继续保存 X/Y、缩放和裁剪信息，以满足中空贴图与头像对齐。

## 7. 用户 API

注册位置：`server/channels/api4/user.go`；实现：`iuin_honors.go`。

| Method | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v4/users/{id}/iuin_honors/summary` | 获取当前称号、头像框和精选成就 |
| `GET` | `/api/v4/users/{id}/iuin_achievements` | 获取成就列表和解锁/精选状态 |
| `PUT` | `/api/v4/users/{id}/iuin_achievements/featured` | 保存精选成就 |
| `GET` | `/api/v4/users/{id}/iuin_titles` | 获取称号列表 |
| `PUT` | `/api/v4/users/{id}/iuin_titles/equipped` | 装备称号 |
| `GET` | `/api/v4/users/{id}/iuin_avatar_frames` | 获取头像框列表 |
| `PUT` | `/api/v4/users/{id}/iuin_avatar_frames/equipped` | 装备头像框 |
| `GET` | `/api/v4/users/iuin_honors/asset?key=...` | 读取荣誉图片资源 |

权限原则：

- 查看其他用户摘要允许已登录用户访问。
- 修改精选成就、称号和头像框时必须具有目标用户编辑权限。
- 未解锁项目不能精选或装备。
- `hidden` 定义不能作为普通展示项目。

## 8. 管理工作台 API

实现：`server/channels/api4/iuin_honors_admin.go`。

### 8.1 会话与定义管理

| Method | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v4/iuin/honors_admin/session` | 验证工作台权限并返回审计权限 |
| `GET/POST` | `/api/v4/iuin/honors_admin/items/{kind}` | 列表和创建定义 |
| `PUT/DELETE` | `/api/v4/iuin/honors_admin/items/{kind}/{item_id}` | 更新与删除定义 |
| `PUT` | `/api/v4/iuin/honors_admin/items/{kind}/order` | 批量排序 |
| `POST` | `/api/v4/iuin/honors_admin/assets` | 上传、裁剪并保存资源 |
| `GET` | `/api/v4/iuin/honors_admin/audits` | 获取审计记录 |

### 8.2 草稿与发布

| Method | 路径 | 用途 |
|---|---|---|
| `GET/POST` | `/api/v4/iuin/honors_admin/drafts` | 当前用户草稿列表和新建 |
| `PUT/DELETE` | `/api/v4/iuin/honors_admin/drafts/{draft_id}` | 更新/删除自己的草稿 |
| `POST` | `/api/v4/iuin/honors_admin/drafts/{draft_id}/submit` | 草稿提交发布队列 |
| `GET` | `/api/v4/iuin/honors_admin/submissions` | 发布队列 |
| `POST` | `/api/v4/iuin/honors_admin/drafts/{draft_id}/publish` | 将 submitted 草稿发布到正式定义表 |

状态机：

```text
创建/编辑
   │
   v
 draft ── submit ──> submitted ── publish ──> 正式定义表
   │                       │
 delete/update             └─ 保留原贡献者，审计发布者
```

发布前会重新进行字段、ID、素材和类型校验。排序接口使用列表一致性校验，资源列表已变化时返回 `409 Conflict`，要求客户端刷新，避免覆盖他人修改。

## 9. 工作台前端

| 文件 | 职责 |
|---|---|
| `webapp/channels/src/components/iuin_honors_admin/index.tsx` | 工作台状态、API、列表、草稿、发布、预览、素材编辑和审计 |
| `webapp/channels/src/components/iuin_honors_admin/iuin_honors_admin.scss` | 独立全屏工作台、导航、表格、抽屉、裁剪器、预览和审计样式 |
| `webapp/channels/src/components/root/root.tsx` | 注册 `/iuin_honors_admin` |

工作台是 Mattermost Webapp 内的独立全屏页面，不是系统控制台子页面，也不是独立服务。当前侧栏包括：

- 成就。
- 称号。
- 头像框。
- 我的草稿。
- 发布。
- 审计记录。

`发布` 项没有图标，但通过固定 20px 占位保持与其他导航项对齐。

## 10. 工作台权限

工作台复用 Mattermost Session，但当前额外使用后端用户名白名单：

```text
litangchao
fengyizhan
liuxinyu
caizijin
leizexin
```

审计权限当前使用相同白名单。

这意味着“系统管理员”角色本身并不自动获得荣誉工作台权限，`ltc_admin` 若未加入白名单会被拒绝。这是当前实现，不应在文档或 UI 中描述为通用 System Admin 能力。

后续更合理的方向是改为：

- Mattermost Permission/Role；或
- 数据库维护的工作台角色；或
- 系统控制台可配置的成员组。

迁移权限模型前需保留现有审计身份和最小权限原则。

## 11. 前端展示面

### 11.1 个人主页

主要文件：

- `components/iuin_profile/iuin_honors.tsx`
- `components/iuin_profile/index.tsx`
- `components/iuin_profile/iuin_profile.scss`

展示：

- 头像上的图片头像框。
- 当前称号。
- 精选成就。
- 成就、称号、头像框选择 Dialog。
- 分类、稀有度、锁定态和预览。

### 11.2 资料小卡片

`ProfilePopover` 只加载 `iuin_honors/summary`，展示当前称号、精选成就和头像框，避免加载完整列表。

### 11.3 全局头像

共享 `Avatar` 组件支持 `avatarFrame`：

- `components/widgets/users/avatar/avatar.tsx`
- `components/widgets/users/avatar/avatar.scss`

DOM 结构是头像在下、透明 Frame Image 绝对定位覆盖在上。Frame 不响应鼠标事件，避免影响头像点击。

`prefers-reduced-motion` 下应关闭非必要动画。

## 12. 当前 Demo 授予与未来自动判定

### 12.1 当前运行逻辑

`ensureIuinHonorDemoUserState()` 在用户没有荣誉记录时：

- 选择前 5 个非隐藏成就并写入 `IuinUserAchievements`。
- 写入精选成就。
- 选择前 5 个非隐藏称号并默认装备第一个。
- 选择前 5 个非隐藏头像框并默认装备第一个。
- 使用 `EvidenceType='demo'` 或 `GrantType='demo'`。

该逻辑用于演示和 UI 验证，不是正式成就判定。

### 12.2 已完成的规则设计

现有文档：

- `开发文档/研究生成就系统-200项.md`
- `开发文档/研究生成就系统-第一期自动判定方案.md`
- `开发文档/研究生成就系统-保留清单.md`

第一期建议事件：

```text
profile_saved
readme_saved
post_created
post_updated
reaction_created
post_pinned
nightly_scan
```

优先级：

- P0：Profile/README 可直接判定。
- P1：Post/Reaction/Pin/Save 等 Mattermost 原生事件。
- P2：跨事件聚合与 Nightly Scan。

### 12.3 自动判定实现要求

正式实现时建议新增独立规则服务，而不是继续把条件写进 `iuin_honors.go`：

```text
Mattermost Event
  → Normalized Achievement Event
  → Rule Evaluator
  → Evidence Builder
  → Idempotent Grant
  → IuinUserAchievements
  → WebSocket / Summary Cache Invalidation
```

必须保证：

- 幂等：同一用户和成就只保留一条活动解锁记录。
- 可解释：保存 `EvidenceType`、`EvidenceId` 和必要 Payload。
- 可重放：规则变更后可对历史事件重算或离线扫描。
- 隐私：不要把私聊正文或敏感附件内容写入公开证据。
- 解耦：工作台发布定义不直接执行用户解锁。

## 13. 历史演进

| Commit | 内容 |
|---|---|
| `3ade7eb1c4` | 建立 200 项研究生成就目录 |
| `496448574f` | 设计第一期自动判定范围 |
| `bee6161abd` | 建立逐项保留清单 |
| `f4dfbf0f9a` | 创建荣誉定义、用户拥有和装备表 |
| `f1d6a513e2` | 添加成就、称号和头像框用户 API |
| `22be27aad3` | 添加 IUIN 管理 API 与相关后端入口 |
| `3142c35c03` | 添加荣誉前端 Client 与类型 |
| `99500d7f5a` | 在个人主页实现荣誉展示与选择 UI |
| `bd0dfe7069` | 在 Profile Popover 展示荣誉摘要 |
| `5bae4e3aa2` | 让共享 Avatar 全局支持头像框贴图 |
| `d303907d4f` | 添加成就图标资源 |
| `131a3deedd` | 添加称号图片资源 |
| `ad94c33ee7` | 添加头像框资源 |
| `a49376d5c2` | 建立荣誉管理工作台 |
| `2e48440a24` | 同期恢复产品 Logo 菜单，保证工作台导航可返回平台 |
| `b1f4da729b` | 增加称号/头像框分类、草稿状态及相关迁移；删除旧 CSS 字段路径 |
| `1571420b25` | 增加提交队列、发布 API 和 Category 输出 |
| `28495bddfd` | 完成草稿/提交/发布工作台前端与全屏布局 |

注：部分早期提交在历史重写前存在不同 Hash；本表使用当前 `master` 可追踪的规范提交。

## 14. 测试与验证

### 14.1 后端

```bash
cd /home/litangchao/IUIN_Platform/mattermost/server
go test -c ./channels/api4
```

重点验证：

- 定义列表字段与 SQL Scan 顺序一致。
- 未解锁项目不能装备或精选。
- Hidden 项目不能普通展示。
- Draft 只能由 Owner 更新和提交。
- Publish 只能处理 `submitted` 项。
- Reorder 冲突返回 409。
- Asset Key 不能越过 `profile/honors/` 范围。

### 14.2 前端

```bash
cd /home/litangchao/IUIN_Platform/mattermost/webapp
PATH=/home/litangchao/IUIN_Platform/tools/node-v24.11.1-linux-x64/bin:$PATH \
npm run test --workspace channels -- --runInBand
```

大范围测试成本较高时，至少执行荣誉工作台、Profile、Popover 和 Avatar 相关定向测试，并运行 ESLint `--quiet`。

### 14.3 手工验收

- [ ] `/u/:username` 显示装备称号、头像框和精选成就。
- [ ] Profile Popover 显示相同摘要且不加载完整列表。
- [ ] 头像框中部透明，头像清晰可见。
- [ ] 头像框在不同 Avatar Size 下对齐。
- [ ] 用户只能装备已解锁且非 hidden 项目。
- [ ] 精选成就不能超过 10 个。
- [ ] 工作台可创建三类草稿。
- [ ] 图片上传、裁剪、X/Y 和缩放可用。
- [ ] 草稿提交后从“我的草稿”进入“发布”。
- [ ] 发布后正式定义列表和个人端可读取。
- [ ] 贡献者与发布操作者信息正确。
- [ ] 审计记录包含 before/after。
- [ ] 工作台页面全宽，不受 Channel Wrapper 或 RHS 限制。

## 15. 已知约束与技术债

- 正式自动成就判定尚未落地，当前 Demo Grant 不适用于生产。
- 工作台用户名白名单写在 Go 源码中，新增管理员需要改代码并重启。
- 工作台 `index.tsx` 和 SCSS 体积较大，应按 Definition、Draft、Publication、Audit 和 Asset Editor 拆分。
- 荣誉摘要使用前端 Cache 与自定义 Window Event 刷新，多标签页和服务端主动授予场景应增加 WebSocket 事件。
- 定义表使用软删除，但开发阶段部分管理操作曾允许直接清数据库；生产环境应统一软删除和审计策略。
- 图片处理同时存在客户端和服务端路径，修改大小限制时必须同时检查两端。
- 头像框 Overlay 需要所有使用 `Avatar` 的表面显式传入 `avatarFrame`；目前并非每一个 Mattermost Avatar 都自动查询荣誉摘要。

## 16. 后续推荐路线

1. 将工作台权限从源码白名单迁移为可配置 Role/Permission。
2. 实现 Normalized Achievement Event 和幂等 Rule Evaluator。
3. 先上线 P0 Profile/README 规则，再上线 P1 协作事件。
4. 增加授予 WebSocket 事件与缓存失效。
5. 为工作台增加 API 集成测试和发布状态机测试。
6. 增加资源引用计数或垃圾回收，清理不再被定义/草稿使用的上传文件。
7. 将 Demo Grant 置于显式开发配置下，生产默认关闭。

## 17. 回退边界

- UI 可单独隐藏，但在删除数据库表前必须先处理用户 Loadout 和资源引用。
- 不应恢复 `StylePayload`/CSS 视觉字段；需要新视觉时应扩展图片资产或结构化元数据。
- Draft/Submission 状态机回退会影响已提交但未发布的数据，回退前必须导出 `IuinHonorAdminDrafts`。
- 删除头像框全局渲染不会删除用户拥有数据，但会让已装备 Frame 暂时不可见。
- 自动判定上线后，不应通过删除定义表回退规则；应停用规则并保留已有证据与授予记录。
