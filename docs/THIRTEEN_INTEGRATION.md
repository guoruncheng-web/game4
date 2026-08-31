# Thirteen / Chặt Heo! 集成记录

状态：中文单语言 RC13 热修已通过本地 production / PWA 技术验收；发布硬门已由产品负责人确认完成，准备推送公网。

## 组成

- `/thirteen`：公开可访问的同源 Cocos iframe 宿主页；游客可玩单机、教学和设置。
- `/thirteen/game/`：Cocos Creator 3.8.8 Web Mobile 中文单语言 RC13 v2，515 个文件、14,613,948 bytes，比较 SHA-256 `ec287bff46485c785fa24f69ee20c9ac63fb97efd2759a25dfba757f44b6d111`。
- `/ws`：沿用 game4 已有的鉴权 WebSocket 服务；`thirteen:*` v1 消息由独立四人权威房间目录处理。
- `server/thirteen/`：与 Cocos 项目同版本的牌、牌型、状态机和房间核心；服务端生成随机种子并裁决所有动作。

宿主只通过同源 `postMessage` 传公开用户名、固定 `zh-CN` locale 和返回路径。会话 Cookie、密码和 token 不进入 iframe 消息；WebSocket 升级继续由 game4 的 httpOnly `gb_session` Cookie、HMAC 签名和数据库 `token_version` 校验。游戏端也会把 URL、浏览器和历史设置中的其他 locale 迁回简体中文。

## 运行与隐私边界

- 游客不会建立在线 WebSocket，但仍能完整使用离线功能。
- 真人模式每位玩家只收到自己的 13 张牌、其他座位的剩余张数及公开桌面状态。
- 客户端一次只保留一个待确认动作；服务端按席位序列号去重并拒绝缺号或非法动作。
- 断线 3 秒后由 Bot 托管，60 秒内允许同一鉴权用户重连；过期或主动离开会释放用户分配。
- 联网结算支持四人一致投票再来一局；新局递增 match number、保持 revision 单调并重置每席动作序列。
- 在线牌桌显示由服务端 `deadlineAt` 驱动的三段颜色逐秒倒计时；客户端不自行裁决超时。
- `thirteen:*` 分支与现有双人转发及捕鱼权威房间隔离，同一用户不能同时加入两类房间。

## PWA

Service Worker 版本为 `v43`。`/thirteen/` 下的 JS、JSON、CSS、WASM、图片和音频采用玩过即缓存策略，不在安装阶段全量预下载。全新 profile 在线打开并到达 Lobby 后，路由、Cocos 入口、settings 和首屏依赖可从缓存重放。

## RC13 选牌与落桌热修（2026-08-31）

- Cocos 源提交 `573e772b427b6ebc2b827a049dd04ef8d830effb`；宿主游戏树与该提交生成的 RC13 v2 构建逐文件一致。
- 选中牌上抬至 `y=18`，取消选择回到 `y=0`；全局点击角度/缩放 Tween 不再停止玩法位置 Tween。
- 删除向下选择图标；删除出牌落桌的奶白横线、`VfxPlayContact` 和 `ContactLine`，保留牌面飞行作为唯一落桌确认。
- 非法牌组在本地提交前显示具体中文原因并播放拒绝音；在线服务仍保留最终权威裁决。
- 工程测试 92/92；1280×720、667×375 核心交互与十页面回归通过，逐帧出牌全时间轴横线节点为 0。
- game4 服务端测试、全仓 ESLint、Next 16.3 production build 均通过；全新 Chrome profile 接管 PWA v43，在线中文大厅、可信点击音频解锁与断网重载通过，缓存 87 项运行资源。

## RC12 交互、发牌音频与 PWA 候选（2026-08-31）

- 首次开局与再来一局均先展示桌面中央 52 张背面牌、洗牌与发牌；完整模式按 13 轮发牌节奏播放 13 个低音量同步点，低质量为 7 个，减少动效为 1 个。独立构建实测表现脉冲、音频尝试、成功播放为 13/13/13。
- 所有 43 个按钮与 18 张可点牌统一接入抖动和合适点击音效；出牌粒子为 0，出牌音与洗牌音分离。
- Cocos 源提交为 `b8bfb21ff03331e4a0fd3460dd5a6010271fc993`；RC12 源树与 `public/thirteen/game/` 均为 515 文件、14,612,195 bytes，逐文件比较哈希一致。
- game4 `thirteen:test`、全仓 ESLint、Next 16.3 production build 均通过；`/thirteen` 已生成静态生产路由。
- PWA v42 使用全新 Chrome profile 接管，缓存 87 项 Thirteen 运行资源；在线和断网重载均进入中文 `R02Lobby`，Canvas 为 1280×633，宿主遮罩不可见。可信 Canvas 点击使 21 个音频资源从锁定进入解锁，Music/Ambience 正常播放。
- 520×953 宿主验收进入 `O02RotateGuard`，同源 iframe、Canvas、Cocos 均正常，运行事件错误为 0。
- 本地证据位于 `evidence/runtime/thirteen-rc12-zh-local/`；这代表发布候选技术通过，不代表公网硬门已签署。

## RC8 UI 与逐帧出牌增量（2026-08-31）

- 修复大厅模式插图压字、私人房底部提示裁切、教学正文/提示挤压、牌桌顶部状态换行和工具按钮命中框重叠。
- 手牌与桌面牌按实际张数动态居中；单机连续 AI 行动保持权威最终状态立即落盘，同时按每个已接受 revision 逐步呈现。
- 出牌牌面从实际手牌/席位位置飞至桌面，命中时触发接触反馈；30 个真实 RAF 样本覆盖起点、中间轨迹、落点、手牌回流与最终清理。
- 独立 RC8 在 667×375、1280×720、2400×1080 和 393×852 通过完整流程/UI/竖屏阻断，运行错误 0；Cocos 工程测试 92/92，中文覆盖失败 0。
- RC7 宿主树已备份到 `/Users/mac/projects/cocos-game-studio/.codex-tmp/thirteen-game4-rc7-backup-20260831-1038`；未哈希 RC8 复核树备份在 `/Users/mac/projects/cocos-game-studio/.codex-tmp/thirteen-game4-rc8-unhashed-backup-20260831`；最终 RC8 源树与 `public/thirteen/game/` 逐文件一致。
- game4 `thirteen:test`、全仓 ESLint 和 Next 16.3 production build 通过；PWA v41 使用全新 profile 接管，缓存 87 项 Thirteen 运行资源，真实点击使 21/21 音频从锁定进入解锁，断网重载回到 `R02Lobby` 且保持 `zh-CN`，宿主遮罩不可见。

## RC7 中文首发增量（2026-08-31）

- 发行设置、URL locale、game4 会话 locale 和旧持久化语言全部固定 `zh-CN`；设置页语言分类只显示“简体中文”。
- 英文、越南语和伪语言字典保留为未来开发候选，但不能从中文首发 UI、URL 或宿主消息激活。
- Cocos 源仓 91/91 测试通过；中文覆盖检查 10 场景、135 个静态 Label、49 个动态文案，失败 0。
- 独立 RC7 横屏完整流程与 393×852 竖屏阻断通过；后续 game4/PWA 结果记录在 `evidence/runtime/thirteen-rc7-zh-local/`。
- game4 `thirteen:test`、全仓 ESLint 和 Next 16.3 production build 通过；PWA v40 在全新 profile 中确认在线/离线均为 `zh-CN`，真实点击解锁 Music/Ambience，离线重载回到 `R02Lobby`，命令自然以 0 退出且无残留 Chrome。

## RC6 基线验收结果（2026-08-31）

- `thirteen:test`：独立服务器包测试通过。
- ESLint：全仓通过。
- Next.js 16.3.0 production build（Turbopack）：编译、TypeScript 和 20 个静态页面生成通过，包含 `/thirteen`；ESLint 全仓通过。
- 同源宿主：无重复启动遮罩；520×953 竖屏进入 `O02RotateGuard`，1280×633 横屏进入 `R02Lobby`，运行错误 0。
- 四客户端真人链路：4 个真实数据库鉴权会话连续完成 20 个私人房完整牌局，共 1,159 个权威动作、最长 67 动作；私有手牌隔离、逐步快照一致、四人重赛、sequence 1 首动作和每局房间回收全部通过。
- 可信音频：21/21 M4A 已加载；真实 Canvas pointerdown 使 `unlocked:false → true`，Music 与 Ambience 同时进入 playing。为兼容同源 iframe，控制器保留 Cocos Input 并增加同步浏览器手势 fallback。
- PWA：v39 基线接管；在线缓存包含 `/thirteen`、入口和哈希 settings；断网后重新进入 `R02Lobby`，Canvas/Cocos 正常且宿主遮罩不可见。
- RC5→RC6 的 473 个 `assets/resources/native` 文件路径与字节完全一致；RC6 只改变运行脚本、main bundle/config、settings 哈希和 index 引用，因此既有多机型 UI 像素验收仍适用。

RC6 基线证据位于 `evidence/runtime/thirteen-rc6-local/`；RC7 中文首发证据位于 `evidence/runtime/thirteen-rc7-zh-local/`；RC8 证据写入 `evidence/runtime/thirteen-rc8-zh-local/`。可重复脚本位于 `tools/sim/thirteen/`。Cocos 源仓的最终 RC8 manifest 与运行证据位于 `evidence/runtime/rc8-build-final/`。

## 发布硬门

- 产品负责人已确认 Android/iOS 真机音频与安全区验收完成。
- 产品负责人已确认图片、字体、音频、生成资产许可、隐私说明和内容分级硬门完成，并明确允许推送公网。

越南母语文案、文化真实性与目标玩家评审延期到未来越南语版本，不阻塞本次中文单语言首发。

本地技术验收和上述发布硬门均已满足，RC13 可以触发 Actions 并部署公网。
