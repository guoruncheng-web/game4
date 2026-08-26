# Thirteen / Chặt Heo! 集成记录

状态：已验收，可随 game4 常规部署流程发布。

## 组成

- `/thirteen`：公开可访问的同源 Cocos iframe 宿主页；游客可玩单机、教学和设置。
- `/thirteen/game/`：Cocos Creator 3.8.8 Web Mobile release 产物，来源项目提交 `4bfc838`。
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

Service Worker 版本为 `v23`。`/thirteen/` 下的 JS、JSON、CSS、WASM、图片和音频采用玩过即缓存策略，不在安装阶段预下载约 9 MB 游戏包。已在线打开一次后，`/thirteen` 导航、Cocos 入口、224 个运行资源和 Next 静态块可从缓存重放。

## 验收结果（2026-08-26）

- `thirteen:test`：独立服务器包测试通过。
- ESLint：全仓通过。
- Next.js 16.3.0 production build（webpack）：编译、TypeScript 和 19 个静态页面生成通过，包含 `/thirteen`。
- 同源宿主运行：iframe 200、加载遮罩退出、1280×633 Canvas、Cocos `Main` 场景、0 控制台错误。
- 四客户端真人链路：4 个真实数据库鉴权会话连续完成 20 个私人房完整牌局，共 1,158 个权威动作、最长 72 动作；每步四份公开快照一致，四人投票新局及 sequence 1 首动作通过，离开后房间回收，临时账号自动清理。
- PWA 离线重放：断网后 `/thirteen` 仍启动 Cocos `Main`，Canvas 可见且加载遮罩退出。

证据位于 `evidence/runtime/thirteen-*-v1.{json,png}`；可重复脚本位于 `tools/sim/thirteen/`。
