# Thirteen Quick Match v4 发布记录

状态：**local accepted；生产部署与公网复验待完成**

日期：2026-09-04

## 跨仓版本

- Cocos 源仓分支：`feat/modern-doudizhu-ui`
- Cocos 源提交：`9f41cc02a198933223de00f44cd78aba49d023a8`
- game4 发布载荷提交：`11872f5c4e76ab3bfcfab1bc9e32e1784399b8d3`
- game4 隔离基线：`origin/main` 的部署前提交 `631170a6770a306860053edd9bd420c8f8e08f18`
- Cocos Creator：3.8.8，`web-mobile`
- 启动场景 UUID：`5066c4ee-d702-4879-8ddb-a69b5836eb08`
- Cocos Web Mobile 树：608 文件，21,335,038 bytes，构建清单 SHA-256 `28103727b107649a5e825f1a3353258ed6d451125c9cc5e8ed4608cf7dc4faed`
- game4 Service Worker：`v57`

## 产品结果

- 快速匹配使用独立界面，并只显示服务端 `thirteen:matchmaking` 广播的真实人数；连接、离线、认证失败阶段不再伪显示 `1/4`。
- 多台设备必须使用四个不同账号才会组成四名玩家。同账号重复登录时，旧连接收到 `session_replaced`，不计为额外玩家且客户端停止无效重连。
- 私人房改为三名客人准备、房主显式开局；快速匹配仍在四名不同账号到齐后自动开始。
- R03 不显示宿主悬浮小房子；R04 保留游戏内“大厅”返回按钮并隐藏其余宿主工具按钮。
- 本批次包含已由 Studio Owner 本地验收通过的钱包钻石区、专用房间按钮、长名字裁剪、快速匹配与对局按钮视觉修正。
- 继续保留 Single-diamond P0：新流程为 `free-v1`，不创建新牌币，不回退战绩与房间持久化。

## 本地发布门

| 门禁 | 结果 |
|---|---|
| Cocos 源测试 | 136/136 通过 |
| game4 ESLint | 通过 |
| Next 16.3 production build | 通过，`/thirteen` 已生成 |
| Thirteen 房间协议 | 通过；客人准备、房主显式开局、恢复与免费重赛通过 |
| 钱包数据库测试 | 通过；10,000 钻石保留、无新牌币赠送 |
| 真实 WebSocket 匹配 | 两个不同认证账号收到 `1→2` 服务端广播；测试账号已清理 |
| 同账号多设备 | 旧连接收到 `session_replaced`，不计为第二人；测试账号已清理 |
| 宿主/游戏按钮 | R03 宿主房子隐藏；R04 游戏内大厅按钮保留，宿主工具隐藏 |
| PWA | v57、605 个缓存资产、21/21 音频、可信点击后音频运行、离线 R02 通过 |
| 精确构建同步 | game4 游戏树与已验收 Creator RC 均为 608 文件、21,335,038 bytes，逐文件摘要一致 |

最终本地证据位于：

`/Users/mac/projects/oner/game/game4-release-thirteen-v4-evidence/final-local/`

## 公网门

推送 `main` 后补录 Actions run、生产健康、发行哈希、真实匹配、同账号顶号、宿主按钮及全新 profile PWA 在线/离线结果。公网门未全部通过前，本记录不得改为 `public accepted`。

## 回滚与备份

- Git 回滚基线：`631170a6770a306860053edd9bd420c8f8e08f18`
- 原本地脏工作区游戏树备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-before-local-quick-match-truthful-v4-20260904`
- 隔离候选替换前游戏树备份：`/Users/mac/projects/oner/game/game4-local-backups/thirteen-game-origin-main-before-release-v4-20260904`
- Creator 构建警告 `mainBundleCompressionType` 未配置并回退 `merge_dep`，本次输出与运行验收正常；该警告是已记录的非阻塞构建配置债务。
