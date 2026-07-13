# Mattermost 可扩展性架构分析

> 📖 官方集成开发文档：https://developers.mattermost.com/integrate/getting-started/

## 0. 引言

Mattermost 是一个开源、可自部署的团队协作平台（Self-hosted Slack 替代品）。技术栈：Go + React/TypeScript + PostgreSQL/MySQL。采用 Monorepo 结构。

### 目录结构

```
mattermost/
├── server/                          # 后端（Go）
│   ├── channels/
│   │   ├── api4/                    # REST API handlers（v4 版本）
│   │   ├── app/                     # 核心业务逻辑层
│   │   ├── store/                   # 数据访问层（DB 操作）
│   │   ├── web/                     # HTTP 路由注册 & 中间件
│   │   ├── wsapi/                   # WebSocket API
│   │   └── jobs/                    # 后台任务调度
│   ├── platform/
│   │   └── services/                # 平台级服务（imageproxy, searchengine 等）
│   ├── public/
│   │   ├── model/                   # 公共数据模型（所有 struct 定义）
│   │   ├── plugin/                  # Plugin API 接口定义（插件可调用的能力）
│   │   └── pluginapi/               # Plugin API 辅助工具
│   ├── einterfaces/                 # Enterprise 功能接口（LDAP, SAML, Compliance 等）
│   ├── cmd/
│   │   ├── mattermost/              # 主服务入口
│   │   └── mmctl/                   # CLI 管理工具
│   └── config/                      # 配置加载 & 热更新
│
├── webapp/                          # 前端（React + TypeScript）
│   ├── channels/                    # 主应用（频道、消息、UI 组件）
│   └── platform/                    # 前端平台层（Redux store, client SDK）
│
├── api/                             # OpenAPI 接口定义文档
└── e2e-tests/                       # 端到端测试（Cypress + Playwright）
```

关键路径说明：

- **一条消息的生命周期**：`webapp → api4/ handler → app/ 业务逻辑 → store/ 持久化 → wsapi/ 推送给在线用户`
- **插件介入点**：Plugin 可以在 `app/` 层通过 Hooks 拦截/修改消息，也可以通过 `public/plugin/` 定义的 API 主动调用平台能力
- **扩展机制入口**：Webhooks 和 Slash Commands 的处理逻辑在 `api4/` 中，Plugin 系统在 `app/plugin*.go` + `public/plugin/`

---

## 1. Webhooks

Webhook 本质上就是一个 URL 地址，用于 Mattermost 与外部系统之间互相发 HTTP 请求。分两个方向：

### 1.1 Incoming Webhook（外部 → Mattermost）

方向：外部系统有事情发生时，主动往 Mattermost 频道里发一条消息。

```
学校教务系统                              Mattermost
    │                                        │
    │  "期末考试时间已公布"                    │
    │  ──── HTTP POST /hooks/{id} ────→      │
    │                                频道里出现这条消息
```

**用法**：在 Mattermost 后台创建一个 Incoming Webhook，系统会生成一个专属 URL（如 `https://your-mm.com/hooks/abc123`）。外部系统只需要往这个 URL 发一个 HTTP POST 请求，请求体里带上消息内容，频道里就会出现这条消息。

**如何创建**：

1. 后台进入 **集成 → Incoming Webhook → 添加**
2. 填写名称、描述，选择接收消息的频道
3. 保存后得到一个专属 URL（这个 URL 要保密，任何人拿到都能往你频道发消息）

**请求示例**：

```bash
curl -X POST https://your-mattermost.com/hooks/abc123 \
  -H 'Content-Type: application/json' \
  -d '{"text": "期末考试时间已公布，请同学们注意查看。"}'
```


**高级参数**（均为可选）：

| 参数 | 作用 |
|------|------|
| `channel` | 覆盖默认频道，发到其他频道（用频道名如 `town-square`，不是显示名） |
| `username` | 覆盖显示的发送者用户名（需管理员开启"允许集成覆盖用户名"） |
| `icon_url` | 覆盖头像图片 URL（需管理员开启"允许集成覆盖头像"） |
| `attachments` | 富文本卡片（Message Attachments），与 `text` 二选一必填 |
| `props.card` | 额外信息，点击消息旁 ℹ️ 图标后在右侧面板展示 |


### 1.2 Outgoing Webhook（Mattermost → 外部）

方向：有人在 Mattermost 频道里发了特定消息时，Mattermost 主动把这条消息转发给外部系统，外部系统处理后还可以回复一条消息。

**场景举例**：学生在频道里提交作业，自动批改系统收到后进行评分，然后把成绩返回到频道。

```
Mattermost                                自动批改系统
    │                                        │
    │  学生发了 "#提交作业 第三章习题"         │
    │  ──── HTTP POST（转发消息内容）────→    │
    │                                  批改系统自动评分
    │  ←──── 返回响应 ────                   │
    │  频道里自动回复 "批改完成：85分 ✅"      │
```

**触发条件**（满足其一即可）：
1. 消息发在你指定的某个频道（不管内容是什么都触发）
2. 消息的第一个词匹配你预设的"触发词"（如 `#提交作业`）

**如何创建**：

1. 后台进入 **集成 → Outgoing Webhook → 添加**
2. 填写名称、描述，选择 Content-Type（一般选 `application/json`）
3. 选择监听的**公开频道** 和/或 填写**触发词**（可以两者都配，也可以只配一个）
4. 选择触发时机：首词精确匹配 或 首词以触发词开头
5. 填写**回调 URL**（外部服务的地址，可以填多个）
6. 保存后得到一个 Token（外部服务用来验证请求确实来自 Mattermost）

**整体流程**：
1. 管理员在 Mattermost 后台创建 Outgoing Webhook，配置触发词和外部系统的 URL
2. 学生在频道里发了匹配的消息
3. Mattermost 自动把消息内容打包成 JSON，POST 到外部系统
4. 外部系统处理完后，可以返回一段 JSON 作为回复消息（也可以不回复）

这就实现了"频道内消息 → 触发外部处理 → 结果回写频道"的完整闭环。

**外部服务的响应格式**：

```json
{
  "response_type": "comment",
  "username": "批改机器人",
  "text": "批改完成：85分 ✅\n\n| 题号 | 结果 |\n|------|------|\n| 1 | ✅ |\n| 2 | ❌ |"
}
```

其中 `response_type` 可选值：
- `"post"`（默认）：作为独立消息发到频道
- `"comment"`：作为线程回复挂在触发消息下方

> Webhook 的局限：它只能被动触发（要么外部系统主动 POST，要么频道消息匹配触发词）。如果想让用户**主动输入一个命令**来触发动作，就需要下一节的 Slash Commands。

---

## 2. Slash Commands（斜杠命令）

用户在消息输入框里输入 `/` 开头的命令，Mattermost 会拦截这条消息，不当作普通聊天发出去，而是触发对应的处理逻辑。

Mattermost 自带了一批**内置命令**（如 `/join` 加入频道、`/leave` 离开频道、`/search` 搜索消息等），同时也允许管理员**创建自定义命令**来对接外部系统。

```
用户在输入框输入：/成绩查询 张三

Mattermost                                成绩管理系统
    │                                        │
    │  拦截到 /成绩查询 命令                   │
    │  ──── HTTP POST（命令 + 参数）────→     │
    │                                  查询张三的成绩
    │  ←──── 返回响应 ────                   │
    │  只有该用户看到 "张三：数学92 英语88"    │
```

### 跟 Outgoing Webhook 的区别

| | Outgoing Webhook | Slash Command |
|---|---|---|
| 触发方式 | 发普通消息，首词匹配触发词 | 用户主动输入 `/命令` |
| 用户感知 | 用户可能不知道触发了外部调用 | 用户明确知道自己在执行命令 |
| 频道限制 | 仅公开频道 | 任何频道（包括私有频道和私聊） |
| 响应可见性 | 所有人可见 | 可以选择只有执行者自己看到 |
| 自动补全 | 无 | 支持（输入 `/` 后弹出命令列表） |

### 三种 Slash Command

| 类型 | 怎么来的 | 举例 |
|------|----------|------|
| 内置命令 | Mattermost 自带，开箱即用 | `/join`、`/leave`、`/search`、`/shrug` |
| 自定义外部命令 | 管理员在后台配置触发词 + 外部 URL，命令触发后 Mattermost POST 到外部服务器 | `/成绩查询`、`/布置作业` |
| 插件命令 | 插件代码中注册，命令触发后直接在插件进程内处理 | 插件提供的 `/jira`、`/github` 等 |

**自定义外部命令**：管理员在后台配置命令名（如 `成绩查询`，用户输入 `/成绩查询` 触发）和外部 URL 即可，详见下方"如何创建"。

**插件命令**：插件在代码中注册自己的命令，触发时直接在插件进程内处理，不需要外部 HTTP 调用，可以直接访问 Mattermost 的内部 API（如查询用户、操作频道等）。后续 Plugin 章节会详细展开。

### 执行流程

```
用户输入 /xxx 参数
       │
       ▼
  API 层接收（api4/command.go）
       │
       ▼
  按优先级依次尝试匹配：
  1. Plugin 注册的命令 → 找到则由 Plugin 处理
  2. 自定义命令（外部）→ 找到则 POST 到外部 URL
  3. 内置命令          → 找到则本地执行
       │
       ▼
  处理响应，发回频道（可选仅自己可见）
```

### 如何创建自定义外部命令

1. 在 Mattermost 后台进入 **集成 → Slash Commands → 添加**
2. 配置：命令名（如 `成绩查询`，用户输入 `/成绩查询` 触发）、请求 URL（外部服务地址）、请求方法（POST 或 GET）
3. 保存后得到一个 Token（外部服务用来验证请求来源）

用户输入 `/成绩查询 张三` 后，Mattermost 会向你配置的 URL 发送如下请求：

```
POST /your-endpoint HTTP/1.1
Content-Type: application/x-www-form-urlencoded

channel_id=xxx&
command=%2F成绩查询&
text=张三&
token=你的验证token&
user_name=wanglaoshi&
trigger_id=xxx
```

外部服务处理完后返回 JSON 响应：

```json
{
  "response_type": "ephemeral",
  "text": "张三：数学92 英语88"
}
```

其中 `response_type` 控制谁能看到回复：
- `"ephemeral"`（默认）：只有执行命令的人自己看到
- `"in_channel"`：频道里所有人都能看到

---

> Slash Commands 的局限：无论是外部命令还是内置命令，本质上都是"HTTP 请求转发"——Mattermost 只是一个中间人，真正的逻辑在外部服务器上。如果想要更深度的集成（拦截消息、修改 UI、访问内部数据），就需要下一章的 Plugin 系统。插件命令的实现方式也会在 Plugin 章节中详细展开。

---

## 3. Plugins（插件系统）

Plugin 是 Mattermost 最强大的扩展机制。前面的 Webhook 和 Slash Command 本质上都是"HTTP 转发"——Mattermost 只是个中间人，真正干活的是外部服务器。而 Plugin 不同：**它是一个独立的小程序，直接运行在 Mattermost 内部**，可以拦截消息、修改 UI、访问数据库、注册命令……几乎能做任何事。

> **Plugin Marketplace（插件市场）**：Mattermost 官方内置了一个插件应用商店（[mattermost.com/marketplace](https://mattermost.com/marketplace/)），管理员可以在系统控制台 → 插件管理页面直接浏览、搜索、一键安装官方和社区开发的现成插件（如 GitHub、Jira、Zoom、Playbooks 等），无需手动下载 .tar.gz 文件。也可通过 CLI 安装：`mmctl plugin marketplace install jitsi`。

### 3.1 插件的工作原理

插件是一个**独立进程**，跟 Mattermost 主程序通过 **RPC（远程过程调用）** 通信。这意味着：

```
┌─────────────────────────────────────────────────────────┐
│                    Mattermost 服务器                      │
│                                                         │
│  ┌─────────────┐    RPC 通信    ┌──────────────────┐   │
│  │  主程序      │ ◄──────────► │  插件进程 A       │   │
│  │  (server)   │               │  (plugin-a.exe)  │   │
│  │             │    RPC 通信    ├──────────────────┤   │
│  │             │ ◄──────────► │  插件进程 B       │   │
│  │             │               │  (plugin-b.exe)  │   │
│  └─────────────┘               └──────────────────┘   │
│                                                         │
│  前端浏览器：                                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Mattermost React App                           │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐           │   │
│  │  │插件A的 │  │插件B的 │  │ 主界面  │           │   │
│  │  │JS 文件 │  │JS 文件 │  │        │           │   │
│  │  └────────┘  └────────┘  └────────┘           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**关键设计**：插件崩溃不会影响主程序。因为它们是独立进程，就算插件出了 bug 挂掉了，Mattermost 本身照常运行。

### 3.2 插件的组成部分

一个 Mattermost 插件由三个组件构成：

| 组件 | 语言 | 作用 | 是否必须 |
|------|------|------|----------|
| **Server**（后端） | Go | 作为独立子进程运行，通过 RPC 与 Mattermost 通信。实现 Hooks 响应事件，调用 API 操作平台 | 可选 |
| **Webapp**（前端） | JS/React | 打包成 JS 文件注入浏览器，通过 registry 往界面插槽中注册自定义组件。网页版和桌面版都能用 | 可选 |
| **Mobile**（移动端） | — | 目前不支持加载自定义 UI，但可通过 Interactive Messages/Dialogs 间接实现功能 | 不支持独立组件 |

> **最低要求**：Server 或 Webapp 至少实现一个。也就是插件可以只有后端没前端，也可以只有前端没后端。Mobile 没有独立的插件组件。

一个完整的插件文件结构：

```
my-plugin/
├── plugin.json          # 必须！插件的"身份证"（名称、版本、配置项）
├── server/              # 可选：Go 后端代码
│   └── plugin.go        # 核心文件，实现钩子函数
├── webapp/              # 可选：React 前端代码
│   └── src/
│       └── index.tsx    # 核心文件，注册 UI 组件
└── assets/              # 可选：图标、静态资源
    └── icon.svg
```

### 3.3 plugin.json —— 插件的身份证

每个插件必须有一个 `plugin.json`，告诉 Mattermost 这个插件是谁、能做什么、有哪些配置项。

```json
{
    "id": "com.example.homework",
    "name": "作业管理系统",
    "description": "让老师在 Mattermost 里布置和批改作业",
    "homepage_url": "https://github.com/your-org/homework-plugin",
    "version": "1.0.0",
    "min_server_version": "9.0.0",
    "server": {
        "executables": {
            "linux-amd64": "server/dist/plugin-linux-amd64",
            "windows-amd64": "server/dist/plugin-windows-amd64.exe"
        }
    },
    "webapp": {
        "bundle_path": "webapp/dist/main.js"
    },
    "settings_schema": {
        "header": "作业管理插件配置",
        "settings": [
            {
                "key": "MaxFileSize",
                "display_name": "最大附件大小(MB)",
                "type": "number",
                "default": 10,
                "help_text": "学生提交作业附件的最大大小"
            },
            {
                "key": "AllowLateSubmission",
                "display_name": "允许迟交",
                "type": "bool",
                "default": false,
                "help_text": "是否允许学生在截止日期后提交作业"
            }
        ]
    }
}
```

**`settings_schema` 的妙处**：你只需要在 JSON 里声明配置项，Mattermost 就会**自动生成一个配置页面**（在系统控制台 → 插件 → 你的插件），管理员可以直接在网页上修改配置，不需要你写任何 UI 代码。

### 3.4 Server Plugin（后端插件）—— 钩子 + API

后端插件用 Go 语言编写，核心就两件事：

1. **Hooks（钩子）**：Mattermost 在特定事件发生时**主动通知**你的插件（"该干活了"）
2. **API**：你的插件**主动调用** Mattermost 的能力（"帮我做这个"）

**通用范式：钩子触发 → 用 API 做事**

```
事件发生（如有人发消息）
       │
       ▼
  Mattermost 检查：有没有插件实现了对应的钩子函数？
       │
  没有 → 跳过，正常继续
       │
  有 → 通过 RPC 调用插件的钩子函数
       │
       ▼
  插件在钩子函数里通过 p.API.xxx() 调用 Mattermost 能力做事
  （发消息、查用户、存数据……）
       │
       ▼
  返回结果给 Mattermost
```

每个后端插件本质上都是这个模式的不同组合：选一个钩子当入口，在里面调 API 干活。

#### 钩子（Hooks）—— 插件的"耳朵"

> 📖 官方完整列表：https://developers.mattermost.com/integrate/reference/server/server-reference/#Hooks
> 📂 源码定义：`server/public/plugin/hooks.go`

钩子是 Mattermost **预先定义好的、固定名字的函数**（共约 39 个，不能自己扩展）。你在插件里写了同名函数，Mattermost 就会在对应事件发生时自动调用它。

**调用方式**：Mattermost 源码里写死了"什么事件调用什么函数"，简化理解如下：

```go
// Mattermost 主程序内部（简化示意，非真实代码）
if 有人发消息 {
    遍历所有已启用的插件 {
        if 该插件实现了 MessageHasBeenPosted {
            通过 RPC 调用该插件的 MessageHasBeenPosted(消息内容)
        }
    }
}
if 有人加入频道 {
    遍历所有已启用的插件 {
        if 该插件实现了 UserHasJoinedChannel {
            通过 RPC 调用该插件的 UserHasJoinedChannel(用户信息, 频道信息)
        }
    }
}
// ... 每种事件都有对应的钩子
```

**关键点**：
- 钩子是固定的"菜单"，你只能从中选用，不能自己发明新钩子
- 你不需要实现所有钩子，只实现你关心的就行
- Mattermost 会自动检测你实现了哪些，没实现的就跳过

---

**全部钩子按类别分（共 39 个）**：

**一、生命周期类**（插件自身的开关机）

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `OnActivate()` | 插件被启用时 | 初始化：注册命令、建表、创建 Bot |
| `OnDeactivate()` | 插件被禁用/服务器关闭时 | 清理：关闭连接、保存状态 |
| `OnConfigurationChange()` | 管理员改了插件配置（settings_schema） | 重新读取配置 |
| `OnInstall()` | 插件被安装时 | 首次安装的引导逻辑 |
| `ConfigurationWillBeSaved()` | 系统配置即将保存时 | 可以拒绝或修改配置 |

**二、消息类**（有人发/改/删消息时）

| 钩子 | 触发时机 | 能力 |
|------|----------|------|
| `MessageWillBePosted()` | 消息即将发出（还没存数据库） | ✏️ 可修改内容 / 🚫 可拒绝发送 |
| `MessageHasBeenPosted()` | 消息已经发出（已存数据库） | 👀 只能旁观（记日志、触发通知） |
| `MessageWillBeUpdated()` | 消息即将被编辑 | ✏️ 可修改 / 🚫 可拒绝 |
| `MessageHasBeenUpdated()` | 消息已经被编辑 | 👀 只能旁观 |
| `MessageHasBeenDeleted()` | 消息被删除后 | 👀 只能旁观 |
| `MessagesWillBeConsumed()` | 客户端请求消息时（返回前） | ✏️ 可修改返回给客户端的内容 |

**三、命令类**

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `ExecuteCommand()` | 用户输入了插件注册的 `/命令` | 处理命令逻辑，返回回复 |

**四、用户类**（用户行为）

| 钩子 | 触发时机 | 用途举例 |
|------|----------|---------|
| `UserWillLogIn()` | 用户即将登录 | 🚫 可拒绝登录（返回非空字符串） |
| `UserHasLoggedIn()` | 用户已登录 | 签到记录 |
| `UserHasBeenCreated()` | 新用户注册完成 | 自动加入默认频道 |
| `UserHasBeenDeactivated()` | 用户被停用 | 清理该用户的数据 |

**五、频道/团队类**（进出频道和团队）

| 钩子 | 触发时机 | 用途举例 |
|------|----------|---------|
| `UserHasJoinedChannel()` | 用户加入频道 | 发欢迎消息 |
| `UserHasLeftChannel()` | 用户离开频道 | 记录离开时间 |
| `UserHasJoinedTeam()` | 用户加入团队 | 自动分配角色 |
| `UserHasLeftTeam()` | 用户离开团队 | 清理权限 |
| `ChannelHasBeenCreated()` | 新频道被创建 | 自动配置频道设置 |
| `ChannelWillBeArchived()` | 频道即将被归档 | 🚫 可拒绝归档 |
| `ChannelMemberWillBeAdded()` | 成员即将被加入频道 | ✏️ 可修改 / 🚫 可拒绝 |
| `TeamMemberWillBeAdded()` | 成员即将被加入团队 | ✏️ 可修改 / 🚫 可拒绝 |

**六、文件类**

| 钩子 | 触发时机 | 能力 |
|------|----------|------|
| `FileWillBeUploaded()` | 文件即将上传 | ✏️ 可修改文件 / 🚫 可拒绝上传 |

**七、HTTP 类**

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `ServeHTTP()` | 有请求发到 `/plugins/{id}/xxx` | 给前端提供 API / 接收外部回调 |
| `ServeMetrics()` | 有请求发到 `/plugins/{id}/metrics` | 暴露监控指标 |

**八、通知类**

| 钩子 | 触发时机 | 能力 |
|------|----------|------|
| `NotificationWillBePushed()` | 推送通知即将发送到手机 | ✏️ 可修改 / 🚫 可拒绝 |
| `EmailNotificationWillBeSent()` | 邮件通知即将发送 | ✏️ 可修改 / 🚫 可拒绝 |

**九、WebSocket 类**（实时连接）

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `OnWebSocketConnect()` | 用户打开了 WebSocket 连接 | 追踪在线用户 |
| `OnWebSocketDisconnect()` | 用户关闭了 WebSocket 连接 | 追踪离线 |
| `WebSocketMessageHasBeenPosted()` | 收到 WebSocket 消息 | 处理实时消息 |

**十、其他/高级**

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `ReactionHasBeenAdded()` | 有人给消息加了表情反应 | 投票统计 |
| `ReactionHasBeenRemoved()` | 有人取消了表情反应 | 投票统计 |
| `PreferencesHaveChanged()` | 用户修改了个人偏好设置 | 同步设置 |
| `OnPluginClusterEvent()` | 收到集群内其他节点的插件事件 | 多服务器同步（High Availability） |
| `RunDataRetention()` | 数据保留任务执行时 | 清理过期数据 |
| `OnSendDailyTelemetry()` | 每日遥测数据发送时 | 上报插件统计 |
| `GenerateSupportData()` | 生成支持包时 | 提供调试信息 |
| `OnSAMLLogin()` | SAML 登录成功后 | 同步用户属性 |
| `OnSharedChannelsSyncMsg()` | 共享频道同步消息 | 跨服务器频道同步 |
| `OnSharedChannelsPing()` | 共享频道健康检查 | 报告连接状态 |
| `OnSharedChannelsAttachmentSyncMsg()` | 共享频道附件同步 | 同步文件 |
| `OnSharedChannelsProfileImageSyncMsg()` | 共享频道头像同步 | 同步头像 |
| `OnCloudLimitsUpdated()` | 云版本限制变更 | 响应套餐变化 |

---

**命名规律**：
- `Will` = 事件**即将**发生，你可以修改或拒绝
- `Has` / `HasBeen` = 事件**已经**发生，你只能旁观
- `On` = 系统级事件通知

#### API —— 插件的"手"

> 📖 官方完整列表（160+ 个方法）：https://developers.mattermost.com/integrate/reference/server/server-reference/#API
> 📂 源码定义：`server/public/plugin/api.go`（`type API interface { ... }`）
>
> 官方原文：*"The API can be used to retrieve data or perform actions on behalf of the plugin. Most methods have direct counterparts in the REST API and very similar behavior. Plugins obtain access to the API by embedding MattermostPlugin and accessing the API member directly."*

API 是插件主动调用 Mattermost 能力的接口，有 160 多个方法（数量太多无法全部列出，详见上方官方链接）。在插件代码里通过 `p.API.方法名()` 调用。

源码里每个 API 方法的注释都标注了 `@tag XXX`，表示它属于哪个分类。一共有 **25 个官方分类**，覆盖了平台上几乎所有你能做的事情：

---

**一、核心数据操作（开发插件最常用）**

| 分类 | 能干什么 | 举例方法 |
|------|----------|---------|
| **User** | 查某个人的信息、改头像、改状态、建新用户、删用户 | `GetUser()` `UpdateUser()` `GetUserStatus()` |
| **Post** | 发消息、改消息、删消息、搜消息、发只有某人看得到的临时消息 | `CreatePost()` `DeletePost()` `SearchPostsInTeam()` `SendEphemeralPost()` |
| **Channel** | 建频道、改频道名、加人进频道、踢人出频道、获取频道成员列表 | `CreateChannel()` `AddChannelMember()` `GetChannelMembers()` |
| **Team** | 建团队、加人进团队、获取团队列表 | `CreateTeam()` `GetTeamMembers()` `AddTeamMember()` |
| **Group** | 建用户组（比如"全体教师"）、把人批量加入组、组和频道自动同步 | `CreateGroup()` `UpsertGroupMember()` `UpsertGroupSyncable()` |

---

**二、插件自身能力**

| 分类 | 能干什么 | 举例方法 |
|------|----------|---------|
| **KeyValueStore** | 插件存自己的数据，像一个迷你数据库（键值对形式） | `KVSet()` `KVGet()` `KVDelete()` `KVList()` |
| **Plugin** | 查看/安装/卸载/启用/禁用插件，获取自己的插件 ID | `GetPlugins()` `EnablePlugin()` `GetPluginID()` |
| **Bot** | 创建一个机器人账号（看起来像一个真人，可以发消息） | `CreateBot()` `GetBot()` `PatchBot()` |
| **Configuration** | 读取插件配置（就是 settings_schema 那些管理员填的值）、读服务器配置 | `LoadPluginConfiguration()` `GetConfig()` `SaveConfig()` |

---

**三、交互与命令**

| 分类 | 能干什么 | 举例方法 |
|------|----------|---------|
| **SlashCommand** | 注册/修改/删除斜杠命令（`/签到`、`/请假`） | `RegisterCommand()` `UpdateCommand()` `DeleteCommand()` |
| **Frontend** | 弹一个填写表单的对话框给用户、给前端推送实时事件 | `OpenInteractiveDialog()` `PublishWebSocketEvent()` |
| **Logging** | 往服务器日志里写记录，方便排查问题 | `LogDebug()` `LogInfo()` `LogWarn()` `LogError()` |

---

**四、文件与媒体**

| 分类 | 能干什么 | 举例方法 |
|------|----------|---------|
| **File** | 上传文件附件、读取已上传的文件内容、获取文件信息 | `UploadFile()` `GetFile()` `GetFileInfos()` |
| **Upload** | 大文件分片上传（文件太大一次传不完，分几块传） | `CreateUploadSession()` `UploadData()` |
| **Emoji** | 获取自定义表情列表、获取表情图片 | `GetEmoji()` `GetEmojiList()` `GetEmojiImage()` |

---

**五、高级 / 企业功能**

| 分类 | 能干什么 | 举例方法 |
|------|----------|---------|
| **SharedChannels** | 多台 Mattermost 服务器之间共享频道、消息自动同步 | `ShareChannel()` `InviteRemoteToChannel()` `SyncSharedChannel()` |
| **OAuth** | 创建/管理 OAuth 应用（给第三方系统做登录对接用） | `CreateOAuthApp()` `GetOAuthApp()` `DeleteOAuthApp()` |
| **Server** | 获取服务器版本、发邮件、检查权限 | `GetServerVersion()` `SendMail()` `RolesGrantPermission()` |
| **Preference** | 读取/设置用户的个人偏好（主题颜色、通知开关等） | `GetPreferencesForUser()` `UpdatePreferencesForUser()` |
| **ChannelSidebar** | 操控左侧频道列表的分组（把频道归类展示） | `GetChannelSidebarCategories()` `UpdateChannelSidebarCategories()` |
| **PropertyField / PropertyValue / PropertyGroup** | 给频道、用户等对象附加自定义字段（v10.10 新增） | `CreatePropertyField()` `UpsertPropertyValue()` |
| **Audit** | 写审计日志（记录"谁在什么时候做了什么"） | `LogAuditRec()` `LogAuditRecWithLevel()` |

---

**总结**：不管你想让插件做什么——发消息、查用户、建频道、存数据、弹对话框、管文件——都能在这 25 个分类里找到对应的 API 方法。插件通过 `p.API` 就能操控整个平台。

---

**Plugin API 和 REST API 的关系**

这两个东西做的事情很多是**一样的**（获取用户、发消息、建频道……），区别是**调用方式**不同：

| | REST API | Plugin API |
|------|----------|-----------|
| **谁在用** | 前端网页、手机 App、外部脚本、第三方系统 | 插件（Mattermost 内部的子进程） |
| **怎么调** | 发 HTTP 请求（如 `GET /api/v4/users/xxx`） | 直接调函数（如 `p.API.GetUser("xxx")`） |
| **要不要认证** | 要，必须带 Token | 不要，插件天然有权限 |
| **走什么通道** | 走网络（HTTP） | 走内部管道（RPC） |


#### 一个完整的后端插件示例

下面是一个最小但完整的插件，功能是：用户输入 `/hello` 命令后，插件回复"你好，XXX！"

```go
// server/plugin.go
package main

import (
    "fmt"
    "github.com/mattermost/mattermost/server/public/model"
    "github.com/mattermost/mattermost/server/public/plugin"
)

// Plugin 结构体，必须嵌入 plugin.MattermostPlugin
type Plugin struct {
    plugin.MattermostPlugin
}

// OnActivate：插件启用时自动调用，用来做初始化
func (p *Plugin) OnActivate() error {
    // 注册一个斜杠命令 /hello
    return p.API.RegisterCommand(&model.Command{
        Trigger:          "hello",
        AutoComplete:     true,
        AutoCompleteDesc: "跟插件打个招呼",
    })
}

// ExecuteCommand：用户输入 /hello 时自动调用
func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
    // 通过 API 获取当前用户信息
    user, err := p.API.GetUser(args.UserId)
    if err != nil {
        return nil, err
    }

    // 返回一条只有该用户能看到的消息
    return &model.CommandResponse{
        ResponseType: model.CommandResponseTypeEphemeral,
        Text:         fmt.Sprintf("你好，%s！🎉", user.Username),
    }, nil
}

// main 函数：插件的入口，固定写法
func main() {
    plugin.ClientMain(&Plugin{})
}
```

**代码解读**：
1. `Plugin` 结构体嵌入了 `plugin.MattermostPlugin`，这样就自动获得了 `p.API` 能力
2. `OnActivate()` 在插件启用时被调用，这里用来注册 `/hello` 命令
3. `ExecuteCommand()` 在用户输入命令时被调用，通过 `p.API.GetUser()` 获取用户名，然后返回问候语
4. `main()` 是固定写法，告诉 Mattermost "我是一个插件，请通过 RPC 跟我通信"

### 3.5 Webapp Plugin（前端插件）—— 往界面上"塞东西"

前端插件用 React/TypeScript 编写，编译后是一个 JS 文件。Mattermost 加载插件时会把这个 JS 注入到浏览器中运行。

#### 三大能力

前端插件能做三类事情：

**① 扩展已有组件 —— 往现有位置"塞东西"**

Mattermost 界面上预留了很多"插槽"（频道标题栏、侧边栏、用户名片弹窗、主菜单等）。你的插件可以往这些插槽里注册自己的 React 组件，多个插件可以同时往同一个插槽里塞东西，互不冲突。

比如：Zoom 插件在频道标题栏加了一个"发起视频会议"的按钮。

**② 添加根组件 —— 做全新的 UI**

不受限于已有插槽，你可以注册一个跟侧边栏、弹窗同级的全新组件。适合做大型面板、全屏页面等复杂交互。灵活性更高，但如果 Mattermost 升级改了界面布局，可能需要微调。

**③ 自定义消息渲染（Custom Post Type）—— 让消息"长得不一样"**

正常消息在聊天窗口里都是一行行文字。但通过 Custom Post Type，你可以让某种类型的消息用完全不同的样式来展示。

举个例子：
- 普通消息：`张三：明天几点开会？`（就是文字）
- 投票类型消息：显示成一个带选项、带进度条的投票卡片
- 日程类型消息：显示成一个日历卡片，带时间和地点

#### 加载流程

前端插件从上传到运行的完整过程：

```
插件上传到服务器并激活
       │
       ▼
服务器检查 plugin.json：有 webapp 部分吗？
       │
  有 → 把编译好的 JS 文件复制到静态资源目录
       │
       ▼
服务器通过 WebSocket 通知所有在线的前端："有新插件激活了"
       │
       ▼
前端收到通知 → 下载这个插件的 JS 文件 → 执行
       │
       ▼
JS 执行后调用 registerPlugin() 注册自己
       │
       ▼
Mattermost 前端调用你插件的 initialize(registry, store)
       │
       ├── registry：用来往界面插槽里塞组件
       │
       └── store：整个前端的 Redux 状态（你能读取所有数据：当前用户、频道列表、消息等）
```

#### 核心概念：Registry（注册表）

Mattermost 前端预留了 20+ 个"插槽"，插件通过 `registry.registerXxx()` 把自己的 React 组件塞进这些插槽。

#### 前端可注册的插槽（按功能分组）

> 📖 完整列表（60 个方法）：https://developers.mattermost.com/integrate/reference/webapp/webapp-reference/

官方 Registry 共有 **60 个方法**（55 个注册 + 5 个取消注册）。下面按功能分组列出代表性的：

**一、界面组件插槽（往已有位置塞 UI）**

| 注册方法 | 塞到哪里 |
|----------|----------|
| `registerLeftSidebarHeaderComponent()` | 左侧栏顶部 |
| `registerBottomTeamSidebarComponent()` | 团队侧栏底部 |
| `registerSidebarChannelLinkLabelComponent()` | 频道名旁边加标签 |
| `registerChannelHeaderButtonAction()` | 频道标题栏加按钮 |
| `registerChannelHeaderIcon()` | 频道标题栏加图标 |
| `registerChannelIntroButtonAction()` | 频道欢迎页加按钮 |
| `registerRightHandSidebarComponent()` | 右侧边栏面板 |
| `registerPopoverUserAttributesComponent()` | 用户名片弹窗加内容 |
| `registerPopoverUserActionsComponent()` | 用户名片弹窗加操作按钮 |
| `registerRootComponent()` | 全局浮层（弹窗、面板） |
| `registerGlobalComponent()` | 全局常驻组件 |
| `registerAppBarComponent()` | 顶部应用栏加图标 |

**二、消息相关（改变消息的样子或行为）**

| 注册方法 | 作用 |
|----------|------|
| `registerPostTypeComponent()` | 自定义某种消息类型的渲染样式（如投票卡片） |
| `registerPostCardTypeComponent()` | 自定义消息卡片样式 |
| `registerPostDropdownMenuAction()` | 消息右键菜单加选项 |
| `registerPostDropdownSubMenuAction()` | 消息右键子菜单 |
| `registerPostActionComponent()` | 消息下方加操作组件 |
| `registerPostEditorActionComponent()` | 输入框工具栏加按钮 |
| `registerPostWillRenderEmbedComponent()` | 自定义链接预览/嵌入组件 |
| `registerPostMessageAttachmentComponent()` | 自定义消息附件组件 |

**三、菜单项（往各种菜单里加选项）**

| 注册方法 | 加到哪个菜单 |
|----------|-------------|
| `registerMainMenuAction()` | 主菜单（左上角汉堡菜单） |
| `registerChannelHeaderMenuAction()` | 频道标题下拉菜单 |
| `registerFileDropdownMenuAction()` | 文件下拉菜单 |
| `registerUserGuideDropdownMenuAction()` | 帮助/用户指南菜单 |
| `registerSidebarBrowseOrAddChannelMenuAction()` | 侧栏"浏览频道"菜单 |

**四、钩子/拦截器（在前端拦截某些操作）**

| 注册方法 | 拦截什么 |
|----------|----------|
| `registerMessageWillBePostedHook()` | 消息发送前（可修改/拒绝） |
| `registerMessageWillBeUpdatedHook()` | 消息编辑保存前 |
| `registerSlashCommandWillBePostedHook()` | 斜杠命令发送前 |
| `registerMessageWillFormatHook()` | 消息格式化渲染前 |
| `registerFilesWillUploadHook()` | 文件上传前 |
| `registerDesktopNotificationHook()` | 桌面通知弹出前 |

**五、路由/页面（注册新页面）**

| 注册方法 | 作用 |
|----------|------|
| `registerNeedsTeamRoute()` | 在团队路径下加自定义页面 |
| `registerCustomRoute()` | 加自定义路由 |
| `registerProduct()` | 注册一个完整的"产品"（独立模块，如 Playbooks） |

**六、系统/高级**

| 注册方法 | 作用 |
|----------|------|
| `registerReducer()` | 注册 Redux reducer（管理插件自己的前端状态） |
| `registerWebSocketEventHandler()` | 监听后端推送的 WebSocket 事件 |
| `registerReconnectHandler()` | 网络重连时执行回调 |
| `registerAdminConsoleCustomSetting()` | 系统控制台加自定义设置组件 |
| `registerTranslations()` | 注册多语言翻译 |
| `registerUserSettings()` | 注册用户设置项 |

#### 一个最小的前端插件示例

```tsx
// webapp/src/index.tsx
import React from 'react';

// 一个简单的频道标题栏按钮组件
const HeaderButton = () => (
    <button onClick={() => alert('你好！这是插件按钮')}>
        📚 作业
    </button>
);

export default class Plugin {
    initialize(registry: any, store: any) {
        // 在频道标题栏注册一个按钮
        registry.registerChannelHeaderButtonAction(
            HeaderButton,       // 按钮组件
            () => {             // 点击回调
                // 可以在这里打开一个面板、发请求等
                console.log('作业按钮被点击了');
            },
            '作业管理',          // tooltip 文字
        );
    }

    uninitialize() {
        // 插件卸载时的清理工作（可选）
    }
}
```

**代码解读**：
1. 导出一个 `Plugin` 类，必须有 `initialize` 方法
2. `initialize` 接收 `registry`（注册插槽用）和 `store`（读取 Redux 状态用）
3. 调用 `registry.registerChannelHeaderButtonAction()` 就在频道标题栏加了一个按钮
4. 用户点击按钮时触发回调函数

### 3.6 前后端配合

大多数实际插件都是前后端配合工作的：

```
用户点击前端按钮
       │
       ▼
  前端 JS 发 HTTP 请求到插件后端
  （URL: /plugins/com.example.homework/api/assignments）
       │
       ▼
  后端 ServeHTTP() 钩子接收请求
       │
       ▼
  后端处理逻辑（查数据库、调 API 等）
       │
       ▼
  返回 JSON 给前端
       │
       ▼
  前端更新 UI 展示结果
```

后端通过 `ServeHTTP()` 钩子暴露自己的 HTTP 接口，前端通过 fetch 调用。每个插件都有自己的专属路径前缀 `/plugins/{plugin-id}/`，不会跟其他插件冲突。

### 3.7 数据存储

插件有两种存储数据的方式：

#### 方式一：KV Store（键值对存储）

最简单的方式，像一个储物柜——按 key 存取 value。

**不需要任何初始化**：KV Store 是 Mattermost 内置的，你不需要建表、不需要配置数据库、不需要初始化。直接调 `p.API.KVSet()` 就能存，开箱即用。

**自动隔离**：每个插件的 KV 数据是完全隔离的。你的插件存了 key 叫 `"config"`，别的插件也存了 `"config"`，互不干扰、互相看不到。

```go
// 存数据（key 是字符串，value 是字节数组，通常把 struct 转成 JSON 再存）
jsonBytes, _ := json.Marshal(homework)
p.API.KVSet("homework_001", jsonBytes)

// 取数据
data, _ := p.API.KVGet("homework_001")
var homework Homework
json.Unmarshal(data, &homework)

// 列出所有 key（分页：从第 0 个开始，取 100 个）
keys, _ := p.API.KVList(0, 100)

// 删除
p.API.KVDelete("homework_001")
```

**高级用法 —— KVSetWithOptions**：

```go
// 设置过期时间（60 秒后自动删除，适合临时数据/缓存）
p.API.KVSetWithOptions("temp_token", tokenBytes, model.PluginKVSetOptions{
    ExpireInSeconds: 60,
})

// 原子操作（只有当旧值等于 oldValue 时才更新，防止并发冲突）
success, _ := p.API.KVSetWithOptions("counter", newValue, model.PluginKVSetOptions{
    Atomic:   true,
    OldValue: oldValue,
})
```

**适合**：配置信息、投票数据、用户状态、临时缓存等不需要复杂查询的场景。

**局限**：
- 只能按 key 精确查找，不能按条件搜索（比如"查找所有未批改的作业"做不到）
- 每个 value 是 `[]byte`，存的数据不宜太大

#### 方式二：自建数据库表

如果需要复杂查询（如按时间范围、按状态筛选），可以通过插件直接操作数据库，创建自己的表。

**用的是哪个数据库？** 就是 Mattermost 自己用的那个数据库（PostgreSQL 或 MySQL）。你的表和 Mattermost 的系统表在同一个数据库里。

**`p.Driver` 是什么？** 它是 Mattermost 提供给插件的数据库驱动，类似 Go 标准库里的 `sql.DB`，可以用来执行 SQL 语句（建表、插入、查询、更新、删除）。

**表名建议加前缀**：因为你的表跟 Mattermost 自己的表以及其他插件的表在同一个数据库里，为了避免冲突，建议给表名加上插件相关的前缀。

```go
// 在 OnActivate() 里建表
func (p *Plugin) OnActivate() error {
    // 通过 Driver 执行 SQL（表名加了前缀 "homework_" 避免冲突）
    _, err := p.Driver.Exec(`
        CREATE TABLE IF NOT EXISTS homework_assignments (
            id VARCHAR(26) PRIMARY KEY,
            teacher_id VARCHAR(26) NOT NULL,
            title TEXT NOT NULL,
            deadline BIGINT,
            status VARCHAR(20) DEFAULT 'open'
        )
    `)
    return err
}

// 查询数据
func (p *Plugin) getOpenAssignments(teacherID string) ([]Assignment, error) {
    rows, err := p.Driver.Query(
        `SELECT id, title, deadline FROM homework_assignments
         WHERE teacher_id = $1 AND status = 'open'
         ORDER BY deadline ASC`,
        teacherID,
    )
    // ... 解析 rows
}
```

**适合**：作业系统、成绩管理、审批流等需要复杂查询（按条件筛选、排序、统计）的场景。

---

**怎么选？**

| | KV Store | 自建表 |
|------|----------|--------|
| 需要配置 | 不需要，直接用 | 需要写建表 SQL |
| 查询能力 | 只能按 key 精确取 | SQL 全部能力（筛选、排序、聚合） |
| 适合数据量 | 小量（几百到几千条） | 大量（几万到几百万条） |
| 典型用途 | 配置、状态、缓存 | 业务数据（订单、作业、记录） |
| 复杂度 | 极低 | 中等（需要会写 SQL） |

### 3.8 插件的生命周期

```
① 安装（出生）
   管理员上传 .tar.gz 文件到系统控制台
   → Mattermost 把它解压到 plugins/ 目录
   → 此时插件还没运行，只是"放在那里"
       │
       ▼
② 启用（开始工作）
   管理员点击"启用"
   → Mattermost 为这个插件启动一个独立进程
   → 调用插件的 OnActivate() 钩子
   → 插件在这里做初始化：注册命令、建表、创建 Bot 等
   → 如果 OnActivate() 返回错误，插件启动失败，被关掉
       │
       ▼
③ 运行中（正常工作）
   → 插件进程持续运行
   → 随时响应各种钩子（有人发消息就触发 MessageHasBeenPosted 等）
   → 随时处理 ServeHTTP 请求
   → Mattermost 定期检查插件进程是否活着（健康检查）
   → 如果插件崩溃了，Mattermost 会自动尝试重启它
       │
       ▼
④ 禁用（退休）
   管理员点击"禁用" 或 Mattermost 服务器要关闭
   → 调用插件的 OnDeactivate() 钩子
   → 插件在这里做清理：关闭数据库连接、停止定时任务等
   → 然后插件进程被杀掉
       │
       ▼
⑤ 卸载（死亡）
   管理员在控制台删除插件
   → 从 plugins/ 目录移除文件
   → 完全消失
```

**关键点**：

- **安装 ≠ 启用**：安装只是把文件放好了，插件还没运行。要手动启用才会跑起来。
- **OnActivate 是初始化入口**：所有初始化代码都放这里（注册命令、建表、启动定时任务）。
- **OnDeactivate 是清理出口**：资源释放、保存状态、关闭连接。
- **自动重启**：Mattermost 有健康检查机制，如果插件进程意外崩溃，会自动尝试重新启动。
- **随服务器启动**：已启用的插件在 Mattermost 服务器重启后会自动加载，不用手动再启用。
- **配置热更新**：管理员在系统控制台改了插件配置时，会触发 `OnConfigurationChange()` 钩子，不需要重启插件。

### 3.9 Mobile（移动端）支持


移动端（手机 App）**不支持**加载自定义前端插件（因为手机 App 是原生编译的，不能动态注入 JS）。

但插件仍然可以在手机上做交互，靠的是以下两个**跨平台通用机制**（网页、桌面、手机都能用）：

#### Interactive Messages（交互式消息）—— 带按钮/菜单的消息

普通消息就是文字。Interactive Messages 可以在消息下面附带**按钮**和**下拉菜单**。用户点击后，Mattermost 会把点击事件发给后端处理。

```
┌──────────────────────────────────────┐
│ 🤖 Bot: 你要参加周五的团建吗？       │
│                                      │
│  [✅ 参加]  [❌ 不参加]  [⏰ 再想想]  │  ← Interactive Message
└──────────────────────────────────────┘
```

**特点**：
- 按钮和菜单直接嵌在聊天消息里，手机上也能正常显示和点击
- 用户点击后，插件后端收到回调，可以更新消息内容或触发下一步

#### Interactive Dialogs（交互式对话框）—— 弹出的填写表单

当用户点击按钮、选菜单项或输入斜杠命令后，可以弹出一个表单让用户填写信息。就像一个迷你问卷。

**支持的字段类型**：

| 类型 | 说明 | 举例 |
|------|------|------|
| `text` | 单行文本 | 姓名、邮箱 |
| `textarea` | 多行文本 | 详细描述 |
| `select` | 下拉选择（支持多选、动态加载） | 选择负责人、选频道 |
| `bool` | 复选框 | "我已阅读协议" |
| `radio` | 单选按钮 | 选部门 |
| `date` | 日期选择器 | 截止日期 |
| `datetime` | 日期+时间选择器 | 会议时间 |

**高级功能**：
- **多步表单**（Multi-step）：像向导一样，Step 1 → Step 2 → Step 3，每步收集不同信息
- **动态选项**（Dynamic select）：下拉框的选项可以从后端实时加载（用户输入搜索关键词，后端返回匹配选项）
- **字段联动**（Field refresh）：改了一个字段的值后，其他字段自动更新（比如选了"省份"后，"城市"下拉框自动刷新）

#### 典型交互流程

```
用户输入 /请假 命令
       │
       ▼
插件后端收到命令 → 弹出 Interactive Dialog（请假申请表单）
       │
       ▼
用户填写：请假类型（单选）、开始日期（日期选择器）、天数（文本）、原因（多行文本）
       │
       ▼
用户点击"提交"
       │
       ▼
插件后端收到表单数据 → 保存到数据库 → 发一条 Interactive Message 到频道
       │
       ▼
频道里出现："张三提交了请假申请 [✅ 批准] [❌ 驳回]"  ← 带按钮的消息
       │
       ▼
主管点击"批准" → 插件后端收到点击事件 → 更新状态 → 通知张三
```

#### 其他手机可用的方式

- **Slash Commands**：手机上也能输入 `/命令`
- **Bot 消息**：插件通过 Bot 发的消息手机上正常显示
- **推送通知**：插件可以通过 `SendPushNotification()` API 向手机发推送

**总结**：手机上虽然不能显示自定义 UI 组件（频道标题栏按钮、右侧面板等），但通过 Interactive Messages + Interactive Dialogs + Slash Commands 的组合，几乎所有业务流程都能在手机上完成。

### 3.10 开发环境与工作流

**需要的工具**：
- Go（后端编译）
- Node.js + npm（前端编译）
- Make（构建工具）
- 一个运行中的 Mattermost 实例（用于测试）

**开发流程**：

```
1. 创建插件项目（可用官方模板 mattermost/mattermost-plugin-starter-template）
2. 写代码（server/plugin.go + webapp/src/index.tsx）
3. 编译：make dist → 生成 .tar.gz 文件
4. 上传：在 Mattermost 系统控制台 → 插件管理 → 上传插件
5. 启用：点击"启用"按钮
6. 测试：在 Mattermost 里验证功能
7. 调试：查看系统控制台日志，修改代码后重复 3-6
```

> 插件系统的强大之处在于：**不修改 Mattermost 源码**，就能实现几乎任何功能。对于学校项目来说，绝大多数需求（作业管理、成绩查询、签到系统等）都可以通过插件实现。

---

## 4. 认证对接

Mattermost 支持对接外部的用户管理系统，让用户用已有的账号直接登录，不需要单独注册。核心有 **3 种认证对接协议**，最大的区别是**用户在哪里输密码**：

```
LDAP：    用户在 Mattermost 登录框输密码
           → Mattermost 拿去问 LDAP 服务器"这个人对不对"

SAML：    用户跳转到学校/公司的统一登录页输密码
           → 验证成功后带着"通行证"跳回 Mattermost

OAuth：   用户跳转到第三方（Google/GitHub）授权
           → 拿到授权令牌后跳回 Mattermost
```


### 4.1 LDAP / Active Directory —— Mattermost 去查花名册

**流程**：

```
用户在 Mattermost 登录页输入学号 + 校园网密码
         │
         ▼
Mattermost 拿着这对账密，去问 LDAP 服务器：
"这个学号+密码是你们的合法用户吗？"
         │
LDAP 服务器回答：
✅ "是的，这是张三，班级：计算机2101"  →  Mattermost 创建/更新用户，登录成功
❌ "密码错了"                          →  返回错误
```

**关键点**：
- 用户全程在 Mattermost 的登录页操作，**不会跳到别的网站**
- Mattermost 主动去 LDAP "翻花名册"，拿回用户信息
- 用的是学校/公司**已有的账号体系**，用户不需要单独注册

**额外能力**：
- **自动同步**：定期从 LDAP 同步用户信息（姓名、邮箱、头像）
- **组同步**：LDAP 用户组 → 自动对应 Mattermost 的团队/频道

**源码位置**：`server/einterfaces/ldap.go`（接口定义）

### 4.2 SAML 2.0 —— 学校统一登录帮你"担保"

**流程**：

```
用户访问 Mattermost → 发现没登录
         │
         ▼
Mattermost 重定向到学校统一登录页（Keycloak/ADFS/Okta 等）
         │
用户在学校统一登录页输入账号密码
         │
         ▼
学校 SSO 验证通过 → 生成"通行证"（SAML Assertion）
"通行证"写着：此人是张三，班级：计算机2101，学校官方盖章，有效期10分钟
         │
         ▼
带着"通行证"跳回 Mattermost
         │
         ▼
Mattermost 验证盖章真实 → 读取用户信息 → 登录成功
```

**关键点**：
- 用户**跳到学校统一登录页**输密码，不在 Mattermost 输
- Mattermost 不知道用户的密码，只认学校盖的章
- 一次登录，多个系统通用（教务、图书馆、Mattermost 共用一个入口）
- 常见身份提供商（IdP）：Okta、Keycloak、Microsoft ADFS、OneLogin、Azure AD

**源码位置**：`server/einterfaces/saml.go`（接口定义）

### 4.3 OAuth2 / OpenID Connect —— "用 Google 登录"那种

**流程**：

```
用户点击 Mattermost 登录页的 [Login with Google]
         │
         ▼
跳转到 Google 授权页：
"Mattermost 想读取你的邮箱和姓名，同意吗？"
         │
用户点击 [同意]
         │
         ▼
Google 生成"授权码"，带用户跳回 Mattermost
         │
         ▼
Mattermost 用"授权码"换"令牌" → 用令牌向 Google 查询用户信息
         │
         ▼
拿到邮箱、姓名 → 创建/匹配账号 → 登录成功
```

**关键点**：
- 用户**跳到第三方**（Google/GitHub）授权
- Mattermost 拿到的是"授权令牌"，不是密码
- 适合"快速登录"场景

**Mattermost 内置支持**：

| 提供商 | 说明 |
|--------|------|
| GitLab | 对接 GitLab 实例 |
| Google | 用 Google 账号登录 |
| Microsoft Office 365 | 用微软账号登录 |
| 通用 OpenID Connect | 对接任何支持 OIDC 的系统（如 Keycloak） |

**源码位置**：`server/einterfaces/oauthproviders.go`（接口定义）

### 4.4 插件与认证的关系

认证对接**不需要写代码**，管理员在系统控制台配置即可。但插件可以通过钩子**介入认证流程**：

| 钩子 | 触发时机 | 能做什么 |
|------|----------|---------|
| `UserWillLogIn()` | 三种方式都适用，验证通过后、会话创建前 | 🚫 可拒绝登录（如：限制非内网 IP） |
| `UserHasLoggedIn()` | 登录完成后通知 | 记录日志、自动加频道 |
| `OnSAMLLogin()` | SAML 登录专属 | 读取"通行证"里的自定义字段（学生班级、部门） |

**场景举例**：
- 用插件实现"只有 VPN 内网才能登录"（`UserWillLogIn` 检查 IP）
- 用插件实现"登录后自动加入对应班级的频道"（`UserHasLoggedIn` 查用户信息）
- 用插件从 SAML 断言里读取学生的专业/年级（`OnSAMLLogin`）

### 4.5 从代码架构看认证

```
server/
├── einterfaces/           ← 企业版认证接口定义（插座）
│   ├── ldap.go            ← LDAP 接口
│   ├── saml.go            ← SAML 接口
│   └── oauthproviders.go  ← OAuth 提供商接口
│
├── public/model/config.go ← 所有认证配置的数据结构
│   ├── LdapSettings       ← LDAP 配置（服务器地址、端口、DN 等）
│   ├── SamlSettings       ← SAML 配置（证书、端点等）
│   ├── GitLabSettings     ← GitLab SSO 配置
│   ├── GoogleSettings     ← Google SSO 配置
│   ├── Office365Settings  ← Microsoft SSO 配置
│   └── OpenIdSettings     ← 通用 OpenID Connect 配置
│
└── enterprise/            ← 企业版实现（不在开源仓库中）
    ├── ldap/              ← LDAP 接口的具体实现
    └── saml/              ← SAML 接口的具体实现
```

**关键设计**：开源版只定义接口（`einterfaces/`），企业版提供实现。这就是为什么 LDAP 和 SAML 需要 License——没有 License，接口没有实现，功能就不可用。而 OAuth/OpenID Connect 的基础支持是内置的。
