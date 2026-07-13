# IUIN 表情包与状态表情系统开发文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档类型 | 领域拆分、数据模型、前后端接口与迁移开发文档 |
| 当前状态 | 消息表情已统一为一套系统；状态表情已独立；旧贴纸表已移除 |
| 功能基线 | `master`（截至 2026-07-11） |
| 早期实现 | `22be27aad3`、`93bbdc5a53` |
| 关键重构 | `db0313c7b9`、`0d99ad5a8b` |
| 相关历史修复 | `fbedfaf6e6`、原生 Unicode 最近使用修复 |
| 功能范围 | 消息表情库、贴纸式发送、内联表情、Reaction、最近使用、状态专用图片、管理控制、兼容迁移 |
| 更新时间 | 2026-07-11 |

## 2. 摘要

IUIN 当前把“消息表情”和“状态表情”定义为两个独立业务域：

- **消息表情系统**只有一套。用户从消息输入框表情面板上传图片，系统把图片存入全局去重资源池，再通过用户关联表决定哪些表情出现在该用户自己的表情库中。同一资源可以用于贴纸式消息、内联 `:emoji:`、Reaction 和最近使用。
- **状态表情系统**独立于消息表情。用户在状态弹窗上传状态专用图片，列表只返回该用户自己的图片；状态保存时服务端再次校验图片所有权。状态图片不会进入消息表情库、Reaction、自动补全或最近消息表情历史。

这次重构解决了早期实现中的三类问题：

1. 旧贴纸、Mattermost Custom Emoji 和 IUIN 表情库形成多套消息表情入口。
2. 状态图片曾通过 Custom Emoji 上传，并以 `status_*` 名称混入消息表情分类与最近使用。
3. 用户希望表情库私有可见，但又需要相同图片全局只保存一份。

最终结构是“**两个领域、三层消息表情模型**”：

```text
消息表情域
  Emoji                 统一身份 / Mattermost 协议兼容
    └─ IuinEmojiAssets  全局内容寻址资源池，SHA-256 去重
          └─ IuinUserEmojis  用户私有表情库成员关系

状态表情域
  IuinStatusImages      按 CreatorUserId 隔离的状态专用图片
    └─ CustomStatus.icon_id / icon_type=status_emoji
```

## 3. 领域边界与不变量

### 3.1 消息表情域

消息表情必须满足：

- 普通用户唯一上传入口是消息输入框中的表情面板。
- 新上传图片只进入统一 IUIN Emoji 流程，不创建第二套 Sticker 或 Backstage Custom Emoji 数据。
- 图片按 SHA-256 全局去重；不同用户上传相同图片时复用同一 `IuinEmojiAssets` 和 FileStore 文件。
- 用户表情库通过 `IuinUserEmojis` 隔离；列表、搜索和自动补全只返回当前用户拥有的 IUIN 表情。
- 消息接收者即使未收藏该表情，也必须能够渲染已经发送的消息或 Reaction，因此按 ID/名称读取图片不做用户库过滤。
- 从消息中“加入表情包”只新增用户与资源的关联，不复制图片。
- 从自己的表情库删除只软删除 `IuinUserEmojis` 关联，不删除全局资源。
- 每个用户最多保留 500 个 IUIN 消息表情。

### 3.2 状态表情域

状态表情必须满足：

- 普通用户唯一上传入口是 Custom Status 弹窗；该弹窗可以从账号菜单、资料卡、移动端入口和个人主页状态角标打开。
- 状态图片只写入 `IuinStatusImages`，不写入 `Emoji`、`IuinEmojiAssets` 或 `IuinUserEmojis`。
- `GET /api/v4/iuin/status_emojis` 只查询当前 Session 用户上传的图片。
- 同一用户重复上传相同内容时按 `CreatorUserId + SHA256` 去重；不同用户之间不共享状态图片记录。
- 设置状态时，服务端要求 `IconType=status_emoji`，并验证 `IconID` 属于当前用户。
- 其他用户可以在展示状态时读取图片，但不能把图片加入消息表情库或设为自己的状态图片。
- 状态图片不会写入 `IuinRecentEmojis`；历史 `status_*` 名称和 `iuin-status-image:*` Token 会被最近表情逻辑过滤。

### 3.3 明确禁止的重新耦合

后续开发不得：

- 在状态弹窗中调用 `createCustomEmoji` 或 `/api/v4/emoji` 上传状态图片。
- 为消息表情重新创建独立 Sticker 表或第二套资源目录。
- 把状态图片显示在消息表情面板的“自定义”分类中。
- 用文件是否属于某个用户来决定消息接收者能否渲染已经发送的表情。
- 把 `status_*` 名称写入消息表情最近使用历史。

## 4. 总体架构

```text
消息输入框 Emoji Picker
  ├─ 系统 Emoji
  ├─ 我的表情库
  ├─ 最近使用
  └─ 上传表情
         │
         v
POST /api/v4/iuin/emojis
         │
         ├─ 图片校验 / 压缩 / SHA-256
         ├─ 已存在 SHA ───────────────┐
         │                            │
         └─ 新资源                    │
              ├─ Emoji               │
              ├─ IuinEmojiAssets     │
              └─ FileStore           │
                                           v
                                  IuinUserEmojis
                                           │
             ┌─────────────────────────────┼─────────────────────┐
             v                             v                     v
       Sticker-mode Post              :emoji: / Reaction     最近使用


Custom Status Modal
  ├─ 系统 Emoji
  ├─ 我的状态图片
  └─ 上传状态图片
         │
         v
POST /api/v4/iuin/status_emojis
         ├─ CreatorUserId + SHA-256 去重
         ├─ IuinStatusImages
         └─ FileStore
                │
                v
CustomStatus {
  emoji: "",
  icon_type: "status_emoji",
  icon_id: "..."
}
```

## 5. 数据模型

核心迁移：

- `000190_create_iuin_stickers`：早期 Sticker 与最近表情表。
- `000198_create_iuin_status_images`：建立独立状态图片域。
- `000199_unify_iuin_emoji_assets`：把旧 Sticker 迁入统一 Emoji 身份和资源池。
- `000200_drop_legacy_iuin_stickers`：删除旧 Sticker 数据表。

### 5.1 Emoji

Mattermost 原生 `Emoji` 表继续作为消息表情身份层：

- `Id` 是消息、Reaction、图片 API 和兼容路由使用的稳定身份。
- IUIN 自动生成内部名称：`iuin_{EmojiId}`。
- `CreatorId` 记录首次创建资源的用户，但不代表只有创建者可以在消息中渲染该资源。

新 IUIN 上传和核心 `/api/v4/emoji` 创建协议最终都进入统一 IUIN Emoji 写入逻辑，因此不会形成第二套新的 Custom Emoji 存储。

### 5.2 IuinEmojiAssets

| 字段 | 说明 |
|---|---|
| `EmojiId` | 主键，同时外键关联 `Emoji.Id` |
| `FilePath` | FileStore 逻辑路径 |
| `Filename` | 原始安全文件名 |
| `MimeType` | 实际输出 MIME |
| `SizeBytes` | 处理后文件大小 |
| `Width/Height` | 处理后尺寸 |
| `Sha256` | 全局内容去重键 |
| `CreateAt/UpdateAt/DeleteAt` | 生命周期 |

活动记录上的 `Sha256` 唯一索引保证相同图片全局只保存一份。

### 5.3 IuinUserEmojis

| 字段 | 说明 |
|---|---|
| `UserId` | 用户 |
| `EmojiId` | 指向全局资源身份 |
| `SortOrder` | 用户库排序/最近加入时间 |
| `CreateAt/UpdateAt/DeleteAt` | 用户关联生命周期 |

主键为 `(UserId, EmojiId)`。删除采用软删除，再次加入时通过 Upsert 恢复并更新 `SortOrder`。

因此：

```text
文件数量 ≈ 唯一图片内容数量
用户库记录数量 = 用户收藏/上传关系数量
```

### 5.4 IuinStatusImages

| 字段 | 说明 |
|---|---|
| `Id` | 状态图片 ID |
| `CreatorUserId` | 所属用户 |
| `FilePath` | FileStore 路径 |
| `Filename/MimeType/SizeBytes` | 文件元数据 |
| `Width/Height/Sha256` | 尺寸与内容摘要 |
| `CreateAt/UpdateAt/DeleteAt` | 生命周期 |

唯一索引是 `(CreatorUserId, Sha256) WHERE DeleteAt=0`。这是“每个用户只看自己的状态图片”的数据层保证之一，也是状态图片不做跨用户资产共享的明确设计。

### 5.5 IuinRecentEmojis

| 字段 | 说明 |
|---|---|
| `UserId` | 用户 |
| `EmojiName` | 系统 Emoji 或有效 Custom Emoji 名称 |
| `UpdateAt` | 最近使用时间 |

服务端每个用户最多保留 100 条，按 `UpdateAt DESC` 返回。

该表只属于消息表情历史。状态图片 Token、`status_*` 历史名称和不存在的 Emoji 不写入。

## 6. 资源存储与图片处理

### 6.1 消息表情

逻辑路径：

```text
iuin_emoji_assets/{EmojiId}/original.{ext}
```

本地 FileStore 默认物理路径：

```text
mattermost/server/data/iuin_emoji_assets/{EmojiId}/original.{ext}
```

`000198` 迁入的旧 Sticker 不复制物理文件，其 `IuinEmojiAssets.FilePath` 可能继续指向原 Sticker 路径；新上传资源使用上述 `iuin_emoji_assets` 路径。排障时应以数据库中的 `FilePath` 为准。

上传处理参数：

- 单文件原始上传上限：256 MiB。
- Multipart HTTP 读取上限：257 MiB（包含表单开销），内存解析阈值为 8 MiB，超出部分写入临时文件并在请求结束时清理。
- 处理后资源上限：50 MiB。
- 静态图片最大边：1024。
- GIF 最大边：512。
- 支持当前 Go 解码链路可识别的 PNG、JPEG、GIF、WebP。
- 静态图片会根据透明通道选择 PNG 或 JPEG，并通过缩放、JPEG Quality 降级控制体积。
- GIF 会先把参与压缩的帧数控制在最多 70 帧，再按缩放比例和抽帧步长继续压缩，同时保留动画。

### 6.2 状态表情

逻辑路径：

```text
iuin_status_images/{StatusImageId}/original.{ext}
```

本地 FileStore 默认物理路径：

```text
mattermost/server/data/iuin_status_images/{StatusImageId}/original.{ext}
```

状态图片约束更严格：

- Multipart 读取上限：2 MiB。
- 原始状态图片大小上限：512 KiB。
- 前端和后端都会检查大小。
- 图片仍复用公共 `processIuinImageAsset()` 做格式、尺寸和内容规范化。

状态资源与消息资源共用图片处理函数，但不共用数据库、文件路径、用户关联或生命周期。

## 7. 消息表情 API

实现：`server/channels/api4/iuin_emojis.go`。

| Method | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v4/iuin/emojis` | 获取当前用户自己的表情库 |
| `POST` | `/api/v4/iuin/emojis` | 上传并加入当前用户表情库 |
| `POST` | `/api/v4/iuin/emojis/{emoji_id}/library` | 把已有资源加入自己的表情库 |
| `DELETE` | `/api/v4/iuin/emojis/{emoji_id}/library` | 从自己的表情库移除 |
| `POST` | `/api/v4/iuin/emojis/{emoji_id}/send` | 发送贴纸式 Emoji Post |
| `GET` | `/api/v4/iuin/emojis/{emoji_id}/image` | 兼容图片读取 |
| `GET` | `/api/v4/iuin/recent_emojis` | 获取消息表情历史 |
| `POST` | `/api/v4/iuin/recent_emojis` | 记录消息表情历史 |

图片 Payload 使用核心 `/api/v4/emoji/{EmojiId}/image`，这样内联 Emoji、Reaction 和贴纸式消息读取同一资源。

### 7.1 贴纸式发送

`POST /send` 创建 Message 为空、Props 包含以下字段的 Post：

```json
{
  "iuin_emoji_id": "EmojiId",
  "iuin_emoji_name": "iuin_EmojiId",
  "iuin_emoji_display_mode": "sticker",
  "iuin_emoji_url": "/api/v4/emoji/EmojiId/image",
  "iuin_emoji_mime": "image/png",
  "iuin_emoji_width": 512,
  "iuin_emoji_height": 512
}
```

发送前必须：

- 当前用户拥有该 `IuinUserEmojis` 关联。
- Channel ID 与 Root ID 合法。
- 通过标准 `createPostChecks()`，复用频道成员和发帖权限。

发送后服务端记录最近使用，并更新在线状态、Last Activity 和 Session 过期时间。

## 8. 状态表情 API 与状态模型

实现：`server/channels/api4/iuin_status_images.go`。

| Method | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v4/iuin/status_emojis` | 获取当前用户自己的状态图片 |
| `POST` | `/api/v4/iuin/status_emojis` | 上传状态专用图片 |
| `GET` | `/api/v4/iuin/status_emojis/{id}/image` | 渲染状态图片 |

第一版解耦路径 `/status_images` 暂时保留为兼容别名，但新前端只使用 `/status_emojis`。

`CustomStatus` 新增：

```go
IconType string `json:"icon_type,omitempty"`
IconID   string `json:"icon_id,omitempty"`
```

系统 Emoji 状态：

```json
{
  "emoji": "tada",
  "icon_type": "emoji",
  "icon_id": ""
}
```

状态专用图片：

```json
{
  "emoji": "",
  "icon_type": "status_emoji",
  "icon_id": "StatusImageId"
}
```

`App.SetCustomStatus()` 会查询：

```sql
SELECT EXISTS (
    SELECT 1
      FROM IuinStatusImages
     WHERE Id = $1
       AND CreatorUserId = $2
       AND DeleteAt = 0
)
```

因此仅修改前端 Payload 无法绕过状态图片所有权校验。

## 9. 前端实现

### 9.1 消息表情面板

核心文件：

| 文件 | 职责 |
|---|---|
| `components/emoji_picker/emoji_picker.tsx` | 我的表情库、最近使用、系统 Emoji、上传和错误状态 |
| `components/emoji_picker/use_emoji_picker.tsx` | 向消息编辑器和状态弹窗提供统一 Picker 封装 |
| `components/advanced_text_editor/use_editor_emoji_picker.tsx` | 消息输入框接入；点击库中表情时调用贴纸式发送 API |
| `utils/iuin_emojis.ts` | 消息表情 API Client |
| `selectors/emojis.ts` | 标准最近 Emoji 规范化及状态 Token 过滤 |
| `actions/post_actions.ts` | 从发送消息提取短代码和 Unicode Emoji 并写入最近使用 |
| `components/post/add_iuin_sticker_favorite_button.tsx` | 从已有消息把资源加入自己的表情库 |

消息输入框启用 `enableIuinEmojiLibrary` 后显示三个 IUIN 面板：

- 我的表情库。
- 最近使用。
- 标准 Emoji。

旧版标准 Category Strip 中的 Custom 分类和重复 Recent 分类已移除，避免再出现第二个“自定义”入口。

### 9.2 最近使用

消息表情历史有两个兼容 Sink：

1. Mattermost 用户 Preference 中的标准 Recent Emoji，前端最多 27 条。
2. `IuinRecentEmojis` 服务端历史，最多 100 条，用于 IUIN Recent 面板。

记录来源包括：

- Picker 点击系统或自定义 Emoji。
- 贴纸式 `/send`。
- 发送含 `:shortcode:` 的普通消息。
- 发送原生 Unicode Emoji；`emoji-regex + EmojiIndicesByUnicode` 会把字符映射为系统短名称。

状态 Token 和 `status_*` 会在服务端、Selector 和加载 Custom Emoji 的路径上过滤，防止状态重新串入消息历史。

### 9.3 状态弹窗

核心文件：

| 文件 | 职责 |
|---|---|
| `components/custom_status/custom_status_modal.tsx` | 文本、系统 Emoji、状态图片上传、私有状态图片列表和保存 |
| `components/custom_status/custom_status_icon.tsx` | 在系统 Emoji 与状态图片之间选择渲染路径 |
| `components/custom_status/custom_status_emoji.tsx` | 账号菜单、资料卡、Header 等位置显示状态 |
| `utils/iuin_status_images.ts` | 状态图片 Token、URL 和 API Client |
| `selectors/views/custom_status.ts` | Custom Status 状态选择与过期判断 |

同一个 `CustomStatusModal` 可以由多个入口打开，但普通用户上传状态图片的渠道只有这一个弹窗：

- User Account Menu。
- Profile Popover。
- Mobile RHS Account Menu。
- 个人主页头像状态角标。

状态弹窗中的上传按钮调用 `uploadIuinStatusImage()`，不再调用 Mattermost `createCustomEmoji()`。

## 10. 可见性、权限与安全

### 10.1 消息表情

- 所有 IUIN API 都要求有效 Mattermost Session。
- 上传总开关是 `ServiceSettings.EnableCustomEmoji`。
- 用户库列表、Custom Emoji List/Search/Autocomplete 会过滤 `IuinEmojiAssets`，只保留当前用户拥有的 IUIN 资源。
- Legacy/非 IUIN Mattermost Emoji 保持原有全局兼容行为。
- Direct Name/Image Resolution 不过滤用户库，因为消息接收者需要渲染现有内容。
- `/send` 要求表情已在发送者库中，并复用频道发帖权限。
- 删除统一 IUIN Emoji 时只移除当前用户关联，不物理删除全局资源。

### 10.2 状态表情

- 上传总开关是 `TeamSettings.EnableCustomUserStatuses`。
- 列表查询固定使用当前 Session User ID。
- 状态保存再次校验 `CreatorUserId`。
- 图片读取允许已登录可信请求者访问，以便其他用户看到状态。
- 状态图片不具备消息发送、收藏、Reaction 或自动补全 API。

## 11. 管理工作台控制

当前没有第二套“表情资源管理工作台”。管理员控制点复用 Mattermost System Console：

### 11.1 Emoji

路径：

```text
/admin_console/site_config/emoji
```

配置：

| Key | 作用 |
|---|---|
| `ServiceSettings.EnableEmojiPicker` | 是否启用 Emoji Picker |
| `ServiceSettings.EnableCustomEmoji` | 是否启用统一消息表情库和用户上传 |

说明文本已明确：用户表情库私有、资源全局去重、同一资源可用于贴纸/内联/Reaction/最近使用，状态图片独立。

### 11.2 Users & Teams

路径：

```text
/admin_console/site_config/users_and_teams
```

配置：

| Key | 作用 |
|---|---|
| `TeamSettings.EnableCustomUserStatuses` | 启用状态文本和用户私有状态图片 |

### 11.3 相似遗留模块

以下模块仍需维护者注意：

- Permission Schemes 中仍有 `Create Custom Emoji`、`Delete Own Custom Emoji`、`Delete Others' Custom Emoji` 等 Mattermost 遗留权限项。统一 IUIN Picker 上传按钮不再使用旧 Backstage Permission Gate；这些权限主要服务遗留 Mattermost 行为，不能当作 IUIN 私有库的数据隔离机制。
- `/team/emoji` 旧用户管理路由已删除实际页面，并重定向到 Integrations；不得恢复为第二个上传入口。
- 核心 `/api/v4/emoji`、旧 `/api/v4/iuin/stickers` 和旧 `/favorite` 路由仍存在，但只是协议适配层，后端都委托到统一 `IuinEmojiAssets + IuinUserEmojis`。
- 旧的非 IUIN Mattermost Emoji 数据仍保持可读兼容；它们不属于新建的 IUIN 全局资源池。

## 12. 兼容路由

### 12.1 Sticker 兼容

实现：`server/channels/api4/iuin_stickers.go`。

| 旧路径 | 当前委托目标 |
|---|---|
| `GET/POST /api/v4/iuin/stickers` | `listIuinEmojis` / `uploadIuinEmoji` |
| `POST/DELETE /stickers/{id}/favorite` | Add/Remove Emoji Library |
| `POST /stickers/{id}/send` | `sendIuinEmoji` |
| `GET /stickers/{id}/image` | `getIuinEmojiImage` |

前端 `utils/iuin_stickers.ts` 也只做函数重导出，没有 Sticker Client 或 Sticker 数据源。

### 12.2 Core Emoji 兼容

- `POST /api/v4/emoji` 委托 `uploadIuinEmoji()`。
- Emoji Image 优先从 `IuinEmojiAssets.FilePath` 读取；不存在 IUIN Asset 时回退到旧 Mattermost Emoji FileStore 路径。
- List/Search/Autocomplete 对 IUIN Asset 执行用户库过滤，对旧全局 Emoji 保持兼容。

## 13. 数据迁移

### 13.1 旧 Sticker 合并

`000198` 执行：

1. 为每个活动 `IuinStickers` 记录创建同 ID 的 `Emoji` 身份。
2. 把文件元数据迁入 `IuinEmojiAssets`，不复制物理文件。
3. 把 `IuinUserStickers` 迁入 `IuinUserEmojis`。
4. 保留旧 Sticker ID，使历史 Post Props 和兼容 URL 仍能解析。

随后 `000199` 删除：

- `IuinUserStickers`
- `IuinStickers`

### 13.2 遗留状态图片清理

早期状态上传生成 `status_*` Custom Emoji。按产品要求，这部分遗留数据不迁移：

```sql
DELETE FROM IuinRecentEmojis
 WHERE EmojiName LIKE 'status\_%' ESCAPE '\';

DELETE FROM Emoji
 WHERE Name LIKE 'status\_%' ESCAPE '\';
```

新状态图片从 `IuinStatusImages` 重新建立，避免把错误历史继续带入消息表情域。

### 13.3 回滚注意事项

- `000199.down` 只能重建旧表结构，不会自动恢复已经删除的历史 Sticker 表数据副本。
- `000198.down` 会删除统一资产与用户库表。
- 生产环境回滚前必须备份数据库及 `iuin_emoji_assets`、`iuin_status_images` FileStore 目录。

## 14. 关键业务流程

### 14.1 用户上传消息表情

```text
选择图片
  → POST /iuin/emojis
  → 校验开关和 Multipart
  → 图片处理 + SHA-256
  → 按 SHA 查询全局池
      ├─ 已存在：复用 EmojiId/FileStore
      └─ 不存在：创建 Emoji + Asset + FileStore
  → Upsert IuinUserEmojis
  → 返回当前用户可用 Payload
  → Picker 刷新并加载 Emoji Identity
```

### 14.2 用户把消息表情加入自己的库

```text
点击消息上的加入按钮
  → POST /iuin/emojis/{id}/library
  → 校验 Asset 存在
  → Upsert IuinUserEmojis
  → 不复制文件
```

### 14.3 用户上传状态图片

```text
打开 CustomStatusModal
  → Picker Footer 上传
  → 前端校验 image/* 和 512 KiB
  → POST /iuin/status_emojis
  → 按当前用户 + SHA-256 去重
  → 写 IuinStatusImages / FileStore
  → 选择 statusEmojiId
  → 保存 CustomStatus(icon_type=status_emoji, icon_id=...)
  → 服务端验证所有权
```

## 15. 测试与验证

相关回归测试：

| 文件 | 覆盖内容 |
|---|---|
| `actions/post_actions.test.ts` | Shortcode 与原生 Unicode 最近使用提取 |
| `custom_status/custom_status_emoji.test.tsx` | 状态专用图片 Token/URL 渲染 |
| `custom_status/custom_status_modal.test.tsx` | 状态弹窗 Payload 与交互 |
| `emoji_picker/emoji_picker.test.tsx` | IUIN 面板、分类与上传入口 |
| `suggestion/emoticon_provider.test.tsx` | Custom Emoji 自动补全 |
| `selectors/emojis.test.js` | 最近使用规范化和状态项过滤 |

关键人工回归清单：

1. 用户 A 上传图片，自己的表情库立即出现。
2. 用户 B 上传相同图片，只新增用户关联，`IuinEmojiAssets` 和物理文件不增加第二份。
3. 用户 B 在未加入前，List/Search/Autocomplete 不显示该 IUIN 表情。
4. 用户 B 可以看到用户 A 已发送消息中的图片。
5. 用户 B 点击“加入表情包”后，自己的 Picker 出现该表情。
6. 发送系统 Emoji、Shortcode、原生 Unicode、自定义 Emoji 和贴纸式 Emoji，最近使用均更新。
7. 状态图片不出现在消息 Picker、Reaction、自动补全和 Recent 中。
8. 用户 A 的状态图片不出现在用户 B 的状态图片列表中。
9. 用户 B 伪造 A 的 `icon_id` 设置状态时，服务端返回拒绝。
10. 关闭 `EnableCustomEmoji` 后消息表情上传不可用；关闭 `EnableCustomUserStatuses` 后状态上传不可用。

数据库核查示例：

```sql
-- 相同 SHA 全局只有一个消息资源
SELECT Sha256, COUNT(*)
  FROM IuinEmojiAssets
 WHERE DeleteAt = 0
 GROUP BY Sha256
HAVING COUNT(*) > 1;

-- 查看用户私有表情库
SELECT UserId, EmojiId, SortOrder
  FROM IuinUserEmojis
 WHERE DeleteAt = 0
 ORDER BY UserId, SortOrder DESC;

-- 状态图片按用户隔离
SELECT CreatorUserId, COUNT(*)
  FROM IuinStatusImages
 WHERE DeleteAt = 0
 GROUP BY CreatorUserId;

-- 不应再有遗留状态名称
SELECT Name
  FROM Emoji
 WHERE DeleteAt = 0 AND Name LIKE 'status\_%' ESCAPE '\';
```

## 16. 运维与排障

### 16.1 Picker 上传成功但列表不出现

检查顺序：

1. `ServiceSettings.EnableCustomEmoji` 是否开启。
2. `Emoji` 是否存在对应 `Id/Name`。
3. `IuinEmojiAssets` 是否存在活动 Asset。
4. `IuinUserEmojis` 是否存在当前用户活动关联。
5. `/api/v4/iuin/emojis` 是否返回该记录。
6. Webapp 是否通过 `loadCustomEmojisIfNeeded()` 加载内部 Emoji Name。

### 16.2 图片在发送者可见、接收者不可见

检查：

- `/api/v4/emoji/{id}/image` 是否能读取 `IuinEmojiAssets.FilePath`。
- FileStore 文件是否存在。
- 不要给 Direct Image Resolution 增加用户库过滤。

### 16.3 状态图片串入消息表情

检查：

- 状态弹窗是否误调用 `createCustomEmoji`。
- Payload 是否使用 `icon_type=status_emoji` 和 `icon_id`。
- `IuinRecentEmojis` 中是否有 `status_*` 或状态 Token。
- `selectors/emojis.ts` 是否仍保留过滤。

### 16.4 后端改动未生效

IUIN Go API 或迁移更新后，开发环境需要重建后端：

```bash
cd /home/litangchao/IUIN_Platform
env IUIN_REBUILD=1 scripts/iuin-platform.sh restart-public
scripts/iuin-platform.sh restart-public
```

第二次无 `IUIN_REBUILD` 重启用于避免后台 watchdog 继承持续重建标志。

## 17. 已知边界与后续建议

- 当前消息表情库上限为每用户 500 个，尚无面向普通用户的批量管理/排序页面。
- 状态图片目前没有删除 API；用户列表只显示自己的记录，但长期需要增加删除、引用检查和 FileStore 清理。
- 全局去重资源缺少“无用户引用后的垃圾回收”任务；删除用户库关联不会物理删除 Asset。
- `IuinRecentEmojis` 与 Mattermost Recent Preference 双 Sink 是兼容设计，后续若合并必须先统一桌面端、移动端和离线行为。
- Permission Schemes 中遗留 Custom Emoji 权限文案与 IUIN 私有库语义并不完全一致，建议后续明确标注兼容范围或拆出 IUIN 专用权限。
- `/status_images`、`/stickers` 等兼容别名应在客户端和历史数据确认无引用后分阶段废弃，不能直接删除。
- `iuin_stickers.go` 当前同时承载兼容路由、Recent Emoji 和公共图片处理函数，建议后续拆为 `iuin_emoji_compat.go`、`iuin_recent_emojis.go`、`iuin_image_assets.go`，降低“看到 Sticker 文件名就误以为仍有第二套系统”的维护成本。

## 18. 关键文件索引

### 后端

- `server/channels/api4/iuin_emojis.go`
- `server/channels/api4/iuin_status_images.go`
- `server/channels/api4/iuin_stickers.go`
- `server/channels/api4/emoji.go`
- `server/channels/app/emoji.go`
- `server/channels/app/status.go`
- `server/public/model/custom_status.go`
- `server/channels/db/migrations/postgres/000198_create_iuin_status_images.up.sql`
- `server/channels/db/migrations/postgres/000199_unify_iuin_emoji_assets.up.sql`
- `server/channels/db/migrations/postgres/000200_drop_legacy_iuin_stickers.up.sql`

### 前端

- `webapp/channels/src/utils/iuin_emojis.ts`
- `webapp/channels/src/utils/iuin_status_images.ts`
- `webapp/channels/src/utils/iuin_stickers.ts`
- `webapp/channels/src/components/emoji_picker/emoji_picker.tsx`
- `webapp/channels/src/components/advanced_text_editor/use_editor_emoji_picker.tsx`
- `webapp/channels/src/components/custom_status/custom_status_modal.tsx`
- `webapp/channels/src/components/custom_status/custom_status_icon.tsx`
- `webapp/channels/src/components/custom_status/custom_status_emoji.tsx`
- `webapp/channels/src/actions/post_actions.ts`
- `webapp/channels/src/selectors/emojis.ts`
- `webapp/channels/src/components/admin_console/admin_definition.tsx`

## 19. 结论

当前架构不再是“两套消息表情系统”，而是：

```text
一套消息表情系统
  = Emoji 身份
  + 全局去重 Asset
  + 用户私有 Library

一套独立状态表情系统
  = 用户私有 Status Image
  + Custom Status 所有权引用
```

两者只复用通用图片处理能力和 Mattermost Session，不复用数据表、资源路径、用户库、最近使用或上传入口。这是后续开发必须保持的系统边界。
