# UMO 集成记录

状态：RC1 已完成本地发布验收；等待 Studio Owner 批准 game4 `main` 推送与公网部署。

## 组成

- `/umo`：游客可直接访问的同源 Cocos iframe 宿主页；首页游戏卡保持当前 UMO Figma MainMenu 封面。
- `/umo/game/`：Cocos Creator 3.8.8 Web Mobile release，246 个文件、10,941,966 bytes；固定 Boot 场景 UUID `a773f311-9d5d-405f-bda8-294a1c21626a`。
- `/ws?game=umo`：game4 WebSocket 服务中的独立 UMO 协议入口；开发环境使用 `:7011`，标准 80/443 部署使用同源地址。
- `server/umo/`：与客户端一致的经典/2v2 规则、共享脉冲、权威计分/生命周期、固定团队表情及超时/断线托管。
- `server/umo/ws-adapter.ts`：250 ms 调度权威计时；15 秒警告，20 秒或当前席掉线后自动执行最低风险合法动作。
- 可选重启恢复：服务器配置 `UMO_STATE_FILE` + 独立 `UMO_STATE_KEY` 后，Gateway 状态以 AES-256-GCM、0600 文件和原子 rename 保存；缺密钥时拒绝启用持久化。

UMO 使用匿名 ID 与恢复 token，不读取 game4 用户密码或会话 token。协议入口在升级阶段与 Thirteen、Ludo、捕鱼等房间隔离。首次打开 Lobby 自动创建六位房间；带 `umoRoom` 参数或会话房间码时仍可按码加入。

## PWA

Service Worker 版本为 `v25`。`/umo/` 下的 JS、JSON、CSS、WASM、图片和字体采用“玩过即缓存”；首次完整加载后，RC1 实测缓存 236 个 UMO 运行资源。安装 PWA 时不主动下载游戏包，在线玩过一次后可离线重放已缓存的 MainMenu。

## 验收结果（2026-08-27）

- Cocos release：3.8.8 `web-mobile`、`debug:false`、显式 Boot 场景，构建通过。
- UMO source：40,056 条规则断言、Gateway、真实 WebSocket 计时调度及 classic/2v2 完整局全部零失败。
- game4 `umo:test`：vendored authority 的真实 WebSocket 四客户端完成 classic 和 teams2v2，对手私有手牌不泄漏，断线恢复事件尾通过。
- game4 宿主调度：10 ms 加速测试下四端收到 15 秒警告与 20 秒托管快照，`BOT_ACTION` 和持久化回调通过；真实进程使用 250 ms。
- 加密重启恢复：临时宿主进程生成 `umo-state-v1` AES-GCM 状态文件（0600、无 JSON 明文标记），重启后健康检查恢复 `umoRooms:1`。
- Next.js 16.3 production build：编译、TypeScript 和 20 个静态页面生成通过，包含 `/umo`；全仓 ESLint 通过。
- PWA 在线：`/umo`、同源 iframe、520×866 Canvas、Cocos `MainMenu`、`MainMenuRoot`、加载遮罩退出均通过。
- 可信音频：真实指针事件完成未静音 → 静音 → 解静音，最终 AudioContext 为 `running`。
- PWA 离线：v25 缓存包含 game index、settings、main bundle 和路由；断网重载 `/umo` 后仍启动编辑器编排的 MainMenu。
- 证据：`evidence/runtime/umo-pwa-rc1/result.json` 与 `umo-pwa-offline.png`。

## 产物追溯

- Cocos RC tree SHA-256：`5771eacb0576dede0d21c8224809b53d6102ea294ccbeee914de887878f68843`。
- Cocos 主 bundle SHA-256：`6d320926540c41ebdeac7df9db4bdef494b015012b9def8723f2ad88aafbb7d5`。
- Cocos settings SHA-256：`eb730a90b17bae5e63a240106fdf39e923e65d0d38fb5aea91e13a2a1b8f4b77`。
- Runtime gzip-9 逐文件合计：8,162,146 bytes。

公网部署、域名、TLS、生产状态密钥和 Actions 权限沿用 game4 现有运维流程。本次 RC 准备不擅自推送 `main`、不触发公网部署。首次发布前需在服务器创建状态目录并配置两个 UMO 状态变量；发布/回滚仍安排维护窗口。
