# Thirteen / Chặt Heo! 集成记录

状态：RC6 本地 production / PWA 技术验收通过；公网推送与部署仍受越南母语/文化、真机听感和法务许可门禁阻塞。

## 组成

- `/thirteen`：公开可访问的同源 Cocos iframe 宿主页；游客可玩单机、教学和设置。
- `/thirteen/game/`：Cocos Creator 3.8.8 Web Mobile RC6，512 个文件、14,862,040 bytes，全树 SHA-256 `968e078ecc42dbe0e86f5a0918e08c35c22164abb310e0a4ce193e390837dcc7`。
- `/ws`：沿用 game4 已有的鉴权 WebSocket 服务；`thirteen:*` v1 消息由独立四人权威房间目录处理。
- `server/thirteen/`：与 Cocos 项目同版本的牌、牌型、状态机和房间核心；服务端生成随机种子并裁决所有动作。

宿主只通过同源 `postMessage` 传公开用户名、语言和返回路径。会话 Cookie、密码和 token 不进入 iframe 消息；WebSocket 升级继续由 game4 的 httpOnly `gb_session` Cookie、HMAC 签名和数据库 `token_version` 校验。

## 运行与隐私边界

- 游客不会建立在线 WebSocket，但仍能完整使用离线功能。
- 真人模式每位玩家只收到自己的 13 张牌、其他座位的剩余张数及公开桌面状态。
- 客户端一次只保留一个待确认动作；服务端按席位序列号去重并拒绝缺号或非法动作。
- 断线 3 秒后由 Bot 托管，60 秒内允许同一鉴权用户重连；过期或主动离开会释放用户分配。
- 联网结算支持四人一致投票再来一局；新局递增 match number、保持 revision 单调并重置每席动作序列。
- 在线牌桌显示由服务端 `deadlineAt` 驱动的三段颜色逐秒倒计时；客户端不自行裁决超时。
- `thirteen:*` 分支与现有双人转发及捕鱼权威房间隔离，同一用户不能同时加入两类房间。

## PWA

Service Worker 版本为 `v39`。`/thirteen/` 下的 JS、JSON、CSS、WASM、图片和音频采用玩过即缓存策略，不在安装阶段全量预下载。全新 profile 在线打开并到达 Lobby 后，路由、Cocos 入口、哈希 settings 和首屏依赖可从缓存重放。

## RC6 验收结果（2026-08-31）

- `thirteen:test`：独立服务器包测试通过。
- ESLint：全仓通过。
- Next.js 16.3.0 production build（Turbopack）：编译、TypeScript 和 20 个静态页面生成通过，包含 `/thirteen`；ESLint 全仓通过。
- 同源宿主：无重复启动遮罩；520×953 竖屏进入 `O02RotateGuard`，1280×633 横屏进入 `R02Lobby`，运行错误 0。
- 四客户端真人链路：4 个真实数据库鉴权会话连续完成 20 个私人房完整牌局，共 1,159 个权威动作、最长 67 动作；私有手牌隔离、逐步快照一致、四人重赛、sequence 1 首动作和每局房间回收全部通过。
- 可信音频：21/21 M4A 已加载；真实 Canvas pointerdown 使 `unlocked:false → true`，Music 与 Ambience 同时进入 playing。为兼容同源 iframe，控制器保留 Cocos Input 并增加同步浏览器手势 fallback。
- PWA：v39 接管；在线缓存包含 `/thirteen`、入口和哈希 settings；断网后重新进入 `R02Lobby`，Canvas/Cocos 正常且宿主遮罩不可见。
- RC5→RC6 的 473 个 `assets/resources/native` 文件路径与字节完全一致；RC6 只改变运行脚本、main bundle/config、settings 哈希和 index 引用，因此既有多机型 UI 像素验收仍适用。

本地候选证据位于 `evidence/runtime/thirteen-rc6-local/`；可重复脚本位于 `tools/sim/thirteen/`。Cocos 源仓的 RC6 manifest 与运行证据位于 `evidence/release/to-launch-rc6/`、`evidence/runtime/to-launch-rc6/`。

## 尚未关闭的发布硬门

- 越南母语文案审校、文化真实性复核与目标玩家盲测。
- Android Chrome 与 iOS Safari 实体机的扬声器/耳机/静音/后台恢复听感和安全区验收。
- 图片、字体、音频、生成资产许可，隐私说明和内容分级的最终签字。

上述门禁关闭前，不推送本候选、不触发 Actions、不部署公网；性能豁免也不能替代这些门禁。
