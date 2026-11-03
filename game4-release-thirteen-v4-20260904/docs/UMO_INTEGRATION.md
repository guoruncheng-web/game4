# UMO 集成记录

状态：RC1–RC7 已于 2026-08-27 部署；RC8 Cocos 原生 UMO splash 已完成本地生产验收，等待同日滚动发布。

## 组成

- `/umo`：游客可直接访问的同源 Cocos iframe 宿主页；RC7 移除 iframe 上方的“返回游戏盒子”按钮，并用路由专属深蓝状态栏与安全区配置。
- `/umo/game/`：Cocos Creator 3.8.8 Web Mobile release，RC8 为 108 个文件、9,851,489 bytes；固定 Boot 场景 UUID `a773f311-9d5d-405f-bda8-294a1c21626a`。
- `/ws?game=umo`：game4 WebSocket 服务中的独立 UMO 协议入口；开发环境使用 `:7011`，标准 80/443 部署使用同源地址。
- `server/umo/`：与客户端一致的经典/2v2 规则、共享脉冲、权威计分/生命周期、固定团队表情及超时/断线托管。
- `server/umo/ws-adapter.ts`：250 ms 调度权威计时；15 秒警告，20 秒或当前席掉线后自动执行最低风险合法动作。
- 可选重启恢复：服务器配置 `UMO_STATE_FILE` + 独立 `UMO_STATE_KEY` 后，Gateway 状态以 AES-256-GCM、0600 文件和原子 rename 保存；缺密钥时拒绝启用持久化。

UMO 使用匿名 ID 与恢复 token，不读取 game4 用户密码或会话 token。协议入口在升级阶段与 Thirteen、Ludo、捕鱼等房间隔离。首次打开 Lobby 自动创建六位房间；带 `umoRoom` 参数或会话房间码时仍可按码加入。

## PWA

Service Worker 版本为 `v32`。`/umo/` 下的 JS、JSON、CSS、WASM、图片和字体采用“玩过即缓存”；RC8 的 React 宿主和 iframe HTML 都不渲染启动页，启动画面完全由 Cocos 原生 `splashScreen` 负责：深蓝背景、居中 UMO 自定义 Logo、1.8 秒最短展示。首次进入缓存 44 项，安装 PWA 时不主动下载游戏包。

## 验收结果（2026-08-27）

- Cocos release：3.8.8 `web-mobile`、`debug:false`、显式 Boot 场景，构建通过。
- UMO source：40,056 条规则断言、Gateway、真实 WebSocket 计时调度及 classic/2v2 完整局全部零失败。
- game4 `umo:test`：vendored authority 的真实 WebSocket 四客户端完成 classic 和 teams2v2，对手私有手牌不泄漏，断线恢复事件尾通过。
- game4 宿主调度：10 ms 加速测试下四端收到 15 秒警告与 20 秒托管快照，`BOT_ACTION` 和持久化回调通过；真实进程使用 250 ms。
- 加密重启恢复：临时宿主进程生成 `umo-state-v1` AES-GCM 状态文件（0600、无 JSON 明文标记），重启后健康检查恢复 `umoRooms:1`。
- Next.js 16.3 production build：编译、TypeScript 和 19 个静态生成单元通过，包含 `/umo`；全仓 ESLint 通过。
- PWA 在线：`/umo`、同源 iframe、520×866 Canvas、Cocos `MainMenu`、`MainMenuRoot`均通过；React/HTML 无启动层，Cocos 原生 splash 显示 UMO Logo 并正常退出，宿主返回按钮不存在。
- 全屏视觉：Loading、MainMenu、Lobby、Match、Result 在 520×953 下背景 cover 铺满、UI 保持安全比例，左右无黑边；无需重新生成场景背景图。
- 可信音频：真实指针事件完成未静音 → 静音 → 解静音，最终 AudioContext 为 `running`。
- PWA 离线：v32 缓存包含 game index、settings、main bundle 和路由；断网重载 `/umo` 后仍启动编辑器编排的 MainMenu。
- 证据：`evidence/runtime/umo-pwa-rc1/result.json` 与 `umo-pwa-offline.png`。

## 产物追溯

- Cocos RC8 sorted-manifest SHA-256：`7b995bcf56c3ee697efb9c17833ec80d08432051a5da34f5dee261fa8a9a1521`。
- Cocos 主 bundle SHA-256：`49745dacca3af4b42e522b569e84c073bcef2a6f5c825935a9086396f5504b24`。
- Cocos settings SHA-256：`3f2f25c428df4b369913f04267fc411c164440fc88d05d46a52bd15c3a6a4556`。
- Runtime gzip-9 逐文件合计：7,028,815 bytes。

公网部署、域名、TLS、生产状态密钥和 Actions 权限沿用 game4 现有运维流程。RC7 Actions `33062315077` 已成功构建并重启双服务；RC8 继续沿用同一幂等流程。
