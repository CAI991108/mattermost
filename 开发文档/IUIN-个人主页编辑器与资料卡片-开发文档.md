# IUIN 个人主页、编辑器与资料小卡片开发文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档类型 | 产品功能与全栈架构开发文档 |
| 当前状态 | 已实现、已持久化、持续迭代 |
| 功能基线 | `master` / `d77a216dce` |
| 首次主线实现 | `a3f0d28d7f` 至 `a624819d35` |
| 最近相关提交 | `5c21512e74`、`a5dad68317`、`d77a216dce` |
| 页面范围 | 个人主页、编辑个人主页、README 工作区、Account/Security、Profile Popover 资料卡片 |
| 更新时间 | 2026-07-11 |

## 2. 摘要

IUIN 个人主页是在 Mattermost 用户体系上扩展的研究型个人空间。它不是独立账号系统，也不是单独部署的站点：

- 身份、头像、账号、安全设置仍复用 Mattermost `Users` 与既有 API。
- 研究方向、经历、教育、论文、获奖、区块可见性等轻量字段存放在用户 `props`。
- README 文件树、Markdown、图片和其他实体文件使用独立 Workspace 表与 FileStore。
- `/u/:username` 是展示页，`/u/:username/edit` 是当前用户编辑页，`/u/:username/edit/readme` 是高级 README 工作区。
- 用户资料小卡片仍使用 Mattermost `ProfilePopover`，只加入主页入口、称号、精选成就与头像框等轻量信息，不把完整主页塞入 Popover。

## 3. 产品边界

### 3.1 包含功能

- 研究主页展示。
- 研究方向、状态、教育、经历、论文、获奖等资料维护。
- 主页区块显示/隐藏。
- README Markdown 编辑与预览。
- 文件树、文件夹、重命名、删除、下载、上传和主文档设置。
- 公共 GitHub 仓库 README 导入与图片引用解析。
- 头像上传、裁剪和高分辨率展示。
- Account 信息与语言设置。
- Security 密码和会话管理。
- GitHub 风格头像状态角标。
- Profile Popover 中的个人主页入口和轻量荣誉信息。

### 3.2 不包含功能

- 不为个人主页建立第二套用户账号或登录系统。
- 不支持在浏览器端无凭据读取私有 GitHub 仓库。
- 不允许查看者编辑其他用户主页；写入仍经过 Mattermost 用户权限判断。
- Profile Popover 不承载完整 README 或所有学术经历。
- 成就定义、授予和工作台的详细实现由《IUIN 成就系统与管理工作台开发文档》描述。

## 4. 页面与路由

| 路由 | 用户 | 作用 |
|---|---|---|
| `/u/:username` | 已登录用户 | 查看目标用户个人主页 |
| `/u/:username/edit` | 当前用户 | 编辑 Homepage、Account、Security 等栏目 |
| `/u/:username/edit/readme` | 当前用户 | 打开高级 README 工作区 |

路由注册位于 `webapp/channels/src/components/root/root.tsx`。个人主页脱离 Channel Shell，但保留：

- `WithUserTheme`
- `GlobalHeader`
- Announcement/System Notice
- Modal Controller
- Global Classification Banner

这样可以避免频道列表、RHS 和消息区残留，同时保留全局导航和主题。

## 5. 总体架构

```text
ProfilePopover / Account Menu
  └─ push('/u/:username')
       └─ IuinProfilePage
            ├─ IuinProfileOverview
            │    ├─ Users.props 轻量资料
            │    ├─ GET workspace
            │    └─ GET honors summary
            └─ IuinProfileEditor
                 ├─ Homepage 编辑
                 ├─ README Advanced Editor
                 ├─ Account 编辑
                 └─ Security 编辑

保存
  ├─ Mattermost 用户 API：Users / props / 账号字段
  └─ PUT /api/v4/users/{id}/iuin_profile/workspace
       ├─ IuinProfileWorkspaces
       ├─ IuinProfileEntries
       └─ FileStore: iuin_profile/users/.../original
```

## 6. 前端模块

### 6.1 核心组件

| 文件 | 职责 |
|---|---|
| `webapp/channels/src/components/iuin_profile/index.tsx` | 展示页、编辑器、README 工作区、Account/Security、头像和状态交互 |
| `webapp/channels/src/components/iuin_profile/profile_data.ts` | Profile props、README 数据结构、解析、序列化、文件操作和 Markdown 清洗 |
| `webapp/channels/src/components/iuin_profile/profile_data.test.ts` | README 主文档、重命名、删除、相对路径和序列化回归测试 |
| `webapp/channels/src/components/iuin_profile/html_code_editor.tsx` | 主页 HTML/代码编辑辅助组件 |
| `webapp/channels/src/components/iuin_profile/use_joined_channels.ts` | 已加入团队/频道标签数据 |
| `webapp/channels/src/components/iuin_profile/iuin_profile.scss` | 展示页、编辑页、README 工作台和响应式样式 |

`index.tsx` 当前体积较大，后续迭代建议按 Overview、Editor、README、Account、Security 拆分，但拆分时必须保持现有保存事务和预览一致性。

### 6.2 资料小卡片

| 文件 | 职责 |
|---|---|
| `components/profile_popover/profile_popover.tsx` | Profile Popover 主体，加载轻量荣誉摘要 |
| `profile_popover_self_user_row.tsx` | 自己的资料卡：进入个人主页 |
| `profile_popover_other_user_row.tsx` | 他人资料卡：主页入口与私信入口 |
| `profile_popover_avatar.tsx` | 带头像框的 Popover 头像 |
| `profile_popover.scss` | 小卡片中的称号和成就适配样式 |

资料卡片的设计原则是“入口 + 摘要”：

- 自己的卡片提供主页入口。
- 他人的卡片提供 Homepage 与可用的私信按钮。
- 显示装备中的称号、头像框、精选成就。
- 不加载完整 README 文件树，不复制主页复杂布局。

## 7. 数据模型

### 7.1 Users.props 轻量字段

`profile_data.ts` 中 `IUIN_PROFILE_PROPS` 定义以下键：

| Key | 用途 |
|---|---|
| `iuin_profile_homepage_html` | 旧版主页内容兼容字段；当前保存时会清空 |
| `iuin_profile_readme_workspace` | 旧版前端 JSON Workspace 兼容字段；当前后端 Workspace 为主 |
| `iuin_profile_research_status` | 研究状态文本 |
| `iuin_profile_status_media` | 研究状态媒体 |
| `iuin_profile_research_fields` | 研究方向 |
| `iuin_profile_research_channels` | 研究频道/方向关联信息 |
| `iuin_profile_experience` | 经历条目序列化值 |
| `iuin_profile_education` | 教育条目序列化值 |
| `iuin_profile_papers` | 论文条目序列化值 |
| `iuin_profile_awards` | 获奖条目序列化值 |
| `iuin_profile_section_visibility` | 主页区块可见性 |

`getProfilePatch()` 保留用户已有 props，只覆盖 IUIN 字段，避免误删插件或 Mattermost 其他功能写入的 props。

### 7.2 README Workspace 数据库

迁移：`server/channels/db/migrations/postgres/000185_create_iuin_profile_workspaces.up.sql`。

#### IuinProfileWorkspaces

| 字段 | 说明 |
|---|---|
| `Id` | Workspace ID |
| `UserId` | 所属用户；活动 Workspace 唯一 |
| `RootName` | 工作区根名 |
| `ActivePath` | 当前主页主 Markdown 文档路径 |
| `GitHubRenderedHtml` | GitHub 渲染 HTML 缓存 |
| `CreateAt/UpdateAt/DeleteAt` | 生命周期字段 |

#### IuinProfileEntries

| 字段 | 说明 |
|---|---|
| `Id` | Entry ID |
| `WorkspaceId` | 所属 Workspace |
| `ParentId` | 父目录 Entry ID |
| `Path/Name` | 逻辑路径与名称 |
| `Type` | `markdown`、`text`、`asset`、`folder` |
| `MimeType/SizeBytes/SHA256` | 文件元数据 |
| `StorageKey` | FileStore 逻辑键 |
| `CreateAt/UpdateAt` | 生命周期字段 |

### 7.3 FileStore

逻辑键规则：

```text
iuin_profile/users/{UserId}/workspaces/{WorkspaceId}/entries/{EntryId}/original
```

当前本地 FileStore 根目录为 `mattermost/server/data/`，因此物理路径通常为：

```text
mattermost/server/data/iuin_profile/users/{UserId}/workspaces/{WorkspaceId}/entries/{EntryId}/original
```

数据库保存索引和元数据，文件内容保存在 FileStore。排障时必须同时检查两层。

## 8. API

API 注册在 `server/channels/api4/user.go`，实现位于 `iuin_profile_workspace.go`。

| Method | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v4/users/{user_id}/iuin_profile/settings` | 获取编辑器需要的账号/安全设置摘要 |
| `GET` | `/api/v4/users/{user_id}/iuin_profile/workspace` | 读取主页 Workspace；不存在时初始化默认 Workspace |
| `PUT` | `/api/v4/users/{user_id}/iuin_profile/workspace` | 保存 Workspace，要求对目标用户具有编辑权限 |

保存流程：

1. 解析并校验 Payload。
2. 规范化路径、类型、主文档和隐式父目录。
3. 启动数据库事务。
4. 更新 Workspace 元信息。
5. 重建该 Workspace 的 Entry 索引。
6. 写入或复用 FileStore 内容。
7. 提交事务。
8. 清理不再被引用的旧文件。
9. 从持久化层重新读取并返回标准 Payload。

## 9. README 工作区

### 9.1 主文档

早期实现固定使用 `README.md`。`5c21512e74` 后：

- 任意 `.md` 或 `.markdown` 文件都可设为主文档。
- `ActivePath` 指向当前主页实际渲染文档。
- 仅选择支持文件不会改变主文档。
- 重命名主文件或其父目录时自动更新 `ActivePath`。
- 删除主文档时回退到其他 Markdown；没有 Markdown 时创建安全的 `README.md`。
- 后端再次校验 `ActivePath` 必须指向 Markdown，避免前端绕过。

### 9.2 文件操作

当前支持：

- 新建文件/文件夹。
- 文件和文件夹重命名。
- 文件和文件夹删除。
- 上传文本、Markdown 和图片。
- 下载文件。
- 设为主文档。
- 将支持文件以相对路径插入主文档。

嵌套主文档引用资源时使用 `getReadmeRelativePath()` 计算相对路径。例如主文档位于 `docs/profile/home.md`，资源位于 `assets/avatar.png`，引用路径为 `../../assets/avatar.png`。

### 9.3 GitHub 导入

导入入口解析公开 GitHub Repository URL，通过 GitHub 公共 API：

- 读取仓库默认分支和 README。
- 读取 README 同目录的支持文件。
- 下载常见图片和文本资源。
- 保存原始 Markdown 与 GitHub 渲染 HTML。
- 在本地预览时替换相对资源引用。

当前限制：

- 私有仓库没有认证流程，不能直接导入。
- 支持文件数量上限为 28。
- 文本文件大小上限为 512 KiB。
- GitHub API Rate Limit、CORS 或网络不可达会导致导入失败。

### 9.4 内容安全

Markdown 通过 `marked` 渲染，再由允许标签、允许属性和 URL 策略进行清洗。修改 Sanitizer 时需要特别检查：

- `script`、事件属性和危险协议必须继续被移除。
- `target="_blank"` 链接需保留安全 `rel`。
- Data URL 只允许受支持的图片场景。
- GitHub 渲染 HTML 也必须经过相同安全边界。

## 10. 编辑个人主页

编辑器包含四个主要区域：

| 区域 | 内容 |
|---|---|
| Homepage | 研究方向、研究状态、主页摘要、学术条目、区块可见性 |
| Profile customization / README | 文件树、Markdown、预览、GitHub 导入、素材管理 |
| Account | 用户名、昵称、姓名、职位、语言、邮箱等 |
| Security | 登录方式、MFA 状态、密码修改、会话撤销 |

保存边界：

- Homepage/轻量资料写入 Mattermost User API。
- README Workspace 使用独立 PUT API。
- Account/Security 调用 Mattermost 既有用户、密码和 Session API。
- 不要把密码或会话数据写入 Profile props。

## 11. 状态与头像

- 头像上传复用 Mattermost `/users/{id}/image`。
- 页面提供客户端裁剪和高分辨率预览。
- 自定义状态角标可点击打开统一 `CustomStatusModal`。
- 当前状态表情以 `icon_type` / `icon_id` 使用独立状态图片系统；个人主页只负责渲染，不把状态图片写入 README 或消息表情库。
- `a5dad68317` 修复了在 Channel 与 Profile 顶层路由切换时 WebSocket 被关闭导致在线状态短暂消失的问题。

## 12. 历史演进

以下为当前 `master` 的规范历史。早期工作曾在其他分支以不同 Hash 出现，后续已按逻辑重写为以下提交，文档以当前主线为准。

| Commit | 内容 |
|---|---|
| `a3f0d28d7f` | 建立 IUIN Profile 数据层 |
| `2f1ec10cb2` | 添加个人主页与编辑器主组件 |
| `d4f80f11aa` | 接入 Root、资料卡和 Account Menu 入口 |
| `a624819d35` | 完成主页、编辑器和 README 工作区样式 |
| `8539f155b4` | 保持 Homepage 为资料卡动作入口 |
| `4d0024c763` | 让个人主页脱离 Channel Shell |
| `f575ad2f47` | 调整 Profile customization 命名与图标 |
| `9cfc73dcb0` | 在独立个人主页保留全局 Header |
| `2e7aee323e` | 移除 README 工作台冗余标题栏 |
| `12937954dd` | 添加 GitHub 风格头像状态角标 |
| `49a2d02083` | 允许从状态角标打开状态弹窗 |
| `1f932c1e87` | 优化状态角标动效 |
| `c3b12c7302` | 完善个人主页自定义工作区 |
| `923c212689` | 实现高分辨率 Profile Avatar |
| `6495686787` | 实现紧凑状态控制 |
| `99500d7f5a` | 在个人主页接入成就、称号和头像框 UI |
| `bd0dfe7069` | 在资料卡展示荣誉摘要 |
| `5c21512e74` | 支持可配置 README 主文档及完整文件操作测试 |
| `a5dad68317` | 修复顶层路由切换导致的在线状态闪断 |
| `d77a216dce` | 让个人主页渲染独立状态图片引用 |

## 13. 测试与验证

### 13.1 自动化

- `profile_data.test.ts`：主文档、文件/目录重命名删除、相对路径、序列化。
- `iuin_profile_workspace_test.go`：后端主文档选择与非 Markdown 回退。
- Profile Popover、Root 和 LoggedIn 相关测试覆盖入口和路由行为。

建议命令：

```bash
cd /home/litangchao/IUIN_Platform/mattermost/server
go test ./channels/api4 -run IuinProfileWorkspace

cd /home/litangchao/IUIN_Platform/mattermost/webapp
npm run test --workspace channels -- --runInBand \
  src/components/iuin_profile/profile_data.test.ts
```

### 13.2 手工验收

- [ ] 从自己的资料卡进入 `/u/{username}`。
- [ ] 从他人资料卡进入目标用户主页。
- [ ] 他人无法进入可写编辑状态。
- [ ] Homepage、Profile customization、Account、Security 可正常切换。
- [ ] 新建、重命名、删除文件和文件夹后刷新仍一致。
- [ ] 嵌套 Markdown 可设为主文档并正确解析相对图片。
- [ ] 删除主文档后自动回退。
- [ ] GitHub 公开仓库 README 可导入，私有仓库显示明确失败。
- [ ] 保存后数据库索引与 FileStore 文件均存在。
- [ ] Channel 与 Profile 来回切换时在线状态不闪断。
- [ ] Profile Popover 不出现完整主页造成的性能或布局问题。

## 14. 已知约束与技术债

- `iuin_profile/index.tsx` 职责过多，应按功能域拆分，但要先补足组件级测试。
- 部分轻量字段仍序列化在 `Users.props`；复杂查询需求出现后应迁移到专用表，而不是继续增加 JSON 字符串。
- Workspace 保存当前采用重建 Entry 索引的策略，超大文件树需要评估增量更新。
- GitHub 导入没有 OAuth/Token，受公共 Rate Limit 限制。
- `dangerouslySetInnerHTML` 依赖 Sanitizer 正确性，任何允许标签/属性扩展都需要安全评审。
- Profile Popover 与主页分别有荣誉展示样式，修改视觉时要同时检查两个表面。

## 15. 回退边界

- Profile 路由、数据层、编辑器和样式互相依赖，不应只回退其中一个基础提交。
- README 可配置主文档功能可作为一个整体回退，但会重新固定到 `README.md`。
- 在线状态修复属于平台级 WebSocket 生命周期，不应与 Profile 视觉一起回退。
- 状态图片渲染兼容属于状态系统，不应重新写回消息 Emoji 字段。
- 删除 Workspace 功能前必须先处理 `IuinProfileWorkspaces`、`IuinProfileEntries` 和 FileStore 中的用户实体文件。
