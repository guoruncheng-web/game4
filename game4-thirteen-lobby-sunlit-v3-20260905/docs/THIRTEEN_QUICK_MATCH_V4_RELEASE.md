# Thirteen Quick Match v4 发布记录

状态：**已部署；功能/PWA 公网门通过，跨地域冷启动性能未通过，等待 Studio Owner 2026-09-05 人工验收**

日期：2026-09-04—2026-09-05

## 跨仓版本

- Cocos 源仓分支：`feat/modern-doudizhu-ui`
- Cocos 功能/UI 提交：`9f41cc02a198933223de00f44cd78aba49d023a8`
- Cocos 启动优化提交：`1b9444450fde0f124197d431b63fd4b6a01ac384`、`a3f08463196287d548f028337a89939f87e6211a`、`a4064a5653be2e969250e9db3dc09fa921507cd9`
- game4 功能载荷提交：`11872f5c4e76ab3bfcfab1bc9e32e1784399b8d3`
- game4 启动优化提交：`89a88123cc2aae8c43cf2f5686fd04395e946f57`、`d486ffee5ce31eeef3b1e70271a3dd160816b7db`、`a14e8e52832789e38ad13cdd7ffffa4ef54fda8c`
- game4 隔离基线：`origin/main` 的部署前提交 `631170a6770a306860053edd9bd420c8f8e08f18`
- Cocos Creator：3.8.8，`web-mobile`
- 启动场景 UUID：`5066c4ee-d702-4879-8ddb-a69b5836eb08`
- 最终 Creator RC：601 文件，19,858,752 bytes，构建树 SHA-256 `8a1b4cd44a16d25c10efdffd2200a30ec1d166ad94f92d17018de844cab2f54e`
- 最终 Web `index.html` SHA-256：`729507012ce10c6c3aa783cff587f9749e5e808647566719683deb86065e514a`
- game4 Service Worker：`v60`

## 产品结果

- 快速匹配使用独立界面，只显示服务端 `thirteen:matchmaking` 广播的真实人数；不再以创建房间流程或本地伪值显示 `1/4`。
- 多台设备必须使用不同账号才会组成多名玩家。同账号重复登录时，旧连接收到 `session_replaced`，不计为额外玩家且客户端停止无效重连。
- 私人房改为三名客人准备、房主显式开局；快速匹配仍在四名不同账号到齐后自动开始。
- R03 隐藏右上角及宿主小房子；R04 隐藏多余工具按钮，同时保留游戏内“大厅”返回按钮。
- 钱包钻石区改为横向图标与数值布局并修复裁剪；房间入口按钮独立重绘；长名字改为安全裁剪。
- 启动只阻塞到 Lobby 所需内容；音乐、环境音与后续场景资源按需加载。启动场景改用系统字体，并裁掉未使用的 Web 引擎模块。
- 继续保留 Single-diamond P0：新流程为 `free-v1`，不创建新牌币，不回退战绩与房间持久化。

## 本地发布门

| 门禁 | 结果 |
|---|---|
| Cocos 源测试 | 138/138 通过 |
| game4 ESLint | 通过 |
| Next 16.3 production build | 通过，`/thirteen` 已生成 |
| Thirteen 房间协议 | 通过；客人准备、房主显式开局、恢复与免费重赛通过 |
| 钱包数据库测试 | 通过；10,000 钻石保留、无新牌币赠送 |
| 真实 WebSocket 匹配 | 两个不同认证账号收到 `1→2` 服务端广播 |
| 同账号多设备 | 旧连接收到 `session_replaced`，不计为第二人 |
| 宿主/游戏按钮 | O02、R02、R03、R04 四场景均通过；R04 游戏内大厅按钮保留 |
| PWA v60 | 冷启动 6,559 ms、热启动 3,262 ms；95 个缓存资产、2 个首屏必要音频；可信点击后音频运行；离线 R02 通过 |
| Studio Owner `localhost:3000` | 已精确同步 v60，游戏入口、SW 文件和页面均为 200，构建哈希及 `quick-match-startup-v7` 标记一致；该进程为 `next dev`，按设计不注册 SW，离线门以本地 production RC 为准 |
| 精确构建同步 | game4 游戏树与 Creator RC 均为 601 文件、19,858,752 bytes，逐文件摘要一致 |

最终本地证据：

`/Users/mac/projects/oner/game/game4-release-thirteen-v4-evidence/startup-v60-local/`

## 公网发布门

| 门禁 | 结果 |
|---|---|
| 功能版 Actions | `33869533293` 成功 |
| 启动优化 v58 Actions | `33891243926` 成功 |
| 引擎裁剪 v59 Actions | `33894347058` 成功 |
| 按需音频 v60 Actions | `33898056770` 成功 |
| 基础健康 | `/thirteen`、游戏入口、`sw.js`、`/ws/health` 均为 200；Thirteen 持久化为 `encrypted-ready` |
| 发行一致性 | 公网 `index.html` SHA-256 与 Creator RC 一致；页面标记 `quick-match-startup-v7`；Service Worker 为 v60 |
| 全新 profile PWA | 在线进入 R02、可信音频、v60 接管、离线重载全部通过；95 个缓存资产、2 个首屏必要音频 |
| 公网真实匹配 | 两个不同正式账号从游戏 UI/生产 WSS 同时看到 `1→2`；同账号替换收到 `session_replaced`；临时账号已注销 |
| 公网宿主四层 | O02 竖屏返回、R02 宿主返回、R03 快速匹配、R04 对局按钮行为全部通过 |

公网证据：

- `/Users/mac/projects/oner/game/game4-release-thirteen-v4-evidence/startup-v60-public/pwa.json`
- `/Users/mac/projects/oner/game/game4-release-thirteen-v4-evidence/startup-v60-public/live-match/result.json`
- `/Users/mac/projects/oner/game/game4-release-thirteen-v4-evidence/startup-v60-public/host.json`

### 已知性能风险

- 公网全新 profile 跨地域冷启动实测 106,089 ms，热启动 6,587 ms；功能、音频、Service Worker 与离线门禁均通过，但冷启动性能本身**未通过**。
- 本次按 Studio Owner 要求完成部署，供 2026-09-05 人工验收；该指标保留为明确发布风险。性能豁免不等于性能通过。

## 回滚与备份

- Git 回滚基线：`631170a6770a306860053edd9bd420c8f8e08f18`
- 原本地脏工作区游戏树备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-local-quick-match-truthful-v4-20260904`
- 隔离候选替换前游戏树备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-origin-main-before-release-v4-20260904`
- v58 前备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-startup-v58-20260904-2325`
- v59 前备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-engine-v59-20260905-0010`
- v60 前备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-lazy-audio-v60-20260905-0050`
- Studio Owner `localhost:3000` 工作树同步前备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-local-v60-sync-20260904`
- Creator 构建警告 `mainBundleCompressionType` 未配置并回退 `merge_dep`，本次输出与运行验收正常；该警告是已记录的非阻塞构建配置债务。
