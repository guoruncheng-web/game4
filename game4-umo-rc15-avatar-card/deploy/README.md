# 部署说明(阿里云 47.86.46.212 · www.gameai.xingzdh.com)

这里放的是**服务器上正在生效的配置的副本**,进版本管理是为了两件事:
换机器时能照着重建;以及有人改了服务器却忘了同步时能看出差异。

**它们不会被自动部署应用。** `deploy.yml` 只同步代码、构建、重启服务 ——
改了这三个文件需要手工登服务器更新并 reload。

| 文件 | 服务器路径 |
| --- | --- |
| `nginx-gameai.conf` | `/etc/nginx/sites-available/gameai` |
| `gameai.service` | `/etc/systemd/system/gameai.service` |
| `gameai-ws.service` | `/etc/systemd/system/gameai-ws.service` |

## 架构

```
浏览器 ──https──> nginx :443
                   ├── /ws        → 127.0.0.1:7011  联机 WebSocket(gameai-ws)
                   ├── /_next/static → 长缓存
                   └── /          → 127.0.0.1:7010  Next.js(gameai)
                                        └── 127.0.0.1:5433  Postgres(docker: gameai-postgres)
```

## 几个不显然的点

- **`/ws` 的 location 必须在 HTTPS 的 server 块里**,不能在 80 端口那个。
  放错的表现是 WebSocket 请求被 Next 的登录中间件截走、跳转到首页 ——
  看起来像鉴权问题,其实是路由问题。
- **`map $http_upgrade $connection_upgrade` 在 `/etc/nginx/conf.d/websocket-upgrade.conf`。**
  缺了它 `Connection` 头是空的,握手会静默失败(返回 200 而不是 101)。
- **`proxy_read_timeout` 必须放大**(这里给了 1 小时)。默认 60 秒会让挂机的玩家莫名掉线。
- **`.env.local` 只在服务器上**,不在仓库里。部署时 rsync 明确排除了它,
  否则 `--delete` 会把它删掉、应用起不来。
- **UMO 权威房间恢复需要两个成对配置。** 在服务器 `.env.local` 设置
  `UMO_STATE_FILE=/srv/gameai/.state/umo/state.enc` 与至少 32 字符的独立高熵
  `UMO_STATE_KEY`。部署工作流会以 `deploy` 身份幂等创建 `.state/umo`（目录 0700），
  在首次部署时由服务器端 Node 生成 32 字节随机密钥，并让 rsync 永久排除 `.state`。
  状态以 AES-256-GCM、文件 0600、临时文件后原子 rename 写入；只配路径不配密钥时
  WebSocket 服务会拒绝启动，避免恢复 token 明文落盘。密钥不得提交仓库或输出到日志。
- 服务以 `deploy` 账号运行,sudo 白名单只有重启那一个服务。
  sshd 的 `AllowUsers` 里必须有 `deploy`,否则 Actions 连不上。
