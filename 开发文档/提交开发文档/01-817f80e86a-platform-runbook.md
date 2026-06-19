# 01 - docs: add IUIN platform runbook

## 提交信息

- Commit: `817f80e86a`
- 类型: 文档
- 范围: 平台启动、前后端服务、端侧访问和排障说明

## 开发目标

补齐 IUIN Platform 的启动和访问说明，让后续 agent 或开发者可以独立判断服务是否已经拉起、监听在哪个地址、端侧应该访问哪个 URL。

## 改动范围

- 新增: `开发文档/前后端拉起与端侧访问.md`

## 实现说明

- 记录 `scripts/iuin-platform.sh` 的常用命令，包括 `start`、`start-public`、`restart-public`、`stop` 和 `status`。
- 区分 Mattermost 后端服务、webapp watcher、数据库和实际端侧访问 URL。
- 明确 `127.0.0.1:8065` 与 `10.26.1.78:8065` 的使用差异，避免 helper 输出和真实监听地址不一致时误判。
- 加入常见故障排查路径，例如 cookie/token 过期、前端 chunk 缓存、端侧无法访问等。

## 验证建议

- 运行 `scripts/iuin-platform.sh status`，确认后端、webapp watcher、数据库和监听地址。
- 使用端侧浏览器访问文档中记录的 LAN 地址。
- 若页面空白，优先检查浏览器控制台 chunk 加载错误和服务端静态资源缓存。

## 回退边界

该提交只新增文档，不影响运行时代码。可单独回退，但不建议删除，因为它是后续端侧访问和服务排障的主要入口。
