# 霓虹突击 2D —— 联机双人协作(Co-op)设计

> 本文定「两台设备怎么变成一局游戏」:连接怎么建、同步什么、谁说了算、断了怎么办。
> 玩法数值仍以 `config.ts` 为准,本文不改任何单人数值。

## 0. 目标与非目标

**目标**:菜单页有一个入口,能看到在线用户并邀请其中一个;对方接受后两人进入同一局,
各自屏幕上都能看到对方的飞机和它的射击,一起打同一批敌机。

**非目标**(明确不做):
- 不做对战。这是**协作**:两架飞机、共享波次、共享 Boss。
- 不做三人及以上。协议按两人写死,加人要重新设计裁决。
- 不做观战、重连续玩、跨局房间、好友系统。
- **不改单人模式的任何数值和手感。** 联机是加一条路径,不是改玩法。

## 1. 技术选型与代价

**WebRTC DataChannel(P2P)+ 现有 Postgres 做信令。**

| 层 | 用什么 | 频率 | 为什么 |
| --- | --- | --- | --- |
| 在线状态、邀请 | 现有 Postgres + 账号系统,HTTP 轮询 | 3 秒一次 | 低频,DB 完全够用,零新增服务 |
| WebRTC 信令(SDP / ICE) | 同上,握手期间加密轮询 | 1 秒一次,连上即停 | 只有几条消息 |
| 局内同步 | **WebRTC DataChannel,两端直连** | 见 §4 | 不经服务器,延迟最低,零流量成本 |

**已知代价 —— NAT 穿透。** 只配公共 STUN 时,约 10–20% 的网络组合(对称型 NAT、
部分企业网)建立不了直连。本作**不做 TURN 中转**:失败就明确告诉用户「连接失败,换个网络」,
不做静默降级。真要覆盖那部分用户,得引入 TURN 服务(要么自建 coturn,要么买托管),
那是一次独立的决策,不在本期。

**为什么不用 Postgres 直接同步游戏状态**:`@neondatabase/serverless` 是 HTTP 驱动,
一次查询一个往返。射击游戏需要每秒十几次同步,那是每秒十几次 HTTP + 数据库写 ——
延迟和成本都不可接受。DB 只承担「找到人」和「握手」,不承担「打游戏」。

## 2. 敌机为什么能只同步事件(本设计的地基)

`spawnEnemy` 里的随机数全部集中在**生成那一刻**:

```ts
const x = 65 + (index % 5) * 102 + Phaser.Math.Between(-18, 18);
phase:  Phaser.Math.Between(0, 2000),
diveAt: this.time.now + Phaser.Math.Between(900, 1500),
enemy.setVelocity(kind === 'weaver' ? 0 : Phaser.Math.Between(-24, 24), fall);
```

而 `Phaser.Math` 用的是 `Math.random()`,不是可播种的 RNG —— **两端各自摇必然对不上**。

但生成之后的移动是**脚本化**的:weaver 是 `cos((time + phase) / 320) * 165`,
dive 是到 `diveAt` 变速。只要 `phase` / `diveAt` 由 host 摇好一起发过来,
再有一个共享时钟,两端算出来的路径就是同一条。

**结论:敌机同步 = 生成事件(带齐所有随机参数)+ 死亡事件 + 低频位置校正。**
不需要逐帧广播敌机状态。

剩下的漂移只来自浮点和帧率差异,靠 §4.3 的低频校正兜住。

## 3. 连接流程

### 3.1 状态机

```
idle ──邀请──> inviting ──对方接受──> signaling ──DataChannel open──> playing
                  │                        │                            │
                  └─超时/拒绝─> idle       └─连不上─> failed            └─任一方断线─> ended
```

### 3.2 数据库(新增三张表)

```sql
-- 在线状态。靠心跳维持,超过 20 秒没心跳就当离线
create table if not exists coop_presence (
  user_id      bigint      primary key references users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  -- idle 才能被邀请,busy 表示已经在局里
  status       text        not null default 'idle'
);
create index if not exists coop_presence_seen_idx on coop_presence (last_seen_at desc);

-- 房间。一局一条,结束后保留一段时间供查询,由定时清理删掉
create table if not exists coop_rooms (
  id          bigserial   primary key,
  host_id     bigint      not null references users(id) on delete cascade,
  guest_id    bigint      not null references users(id) on delete cascade,
  -- pending / accepted / connected / ended / declined
  state       text        not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 信令消息。**读到即删**,不是消息历史
create table if not exists coop_signals (
  id         bigserial   primary key,
  room_id    bigint      not null references coop_rooms(id) on delete cascade,
  from_id    bigint      not null,
  kind       text        not null,   -- offer / answer / ice
  payload    jsonb       not null,
  created_at timestamptz not null default now()
);
create index if not exists coop_signals_room_idx on coop_signals (room_id, id);
```

**`coop_signals` 必须读完就删。** 它是管道不是日志 —— 留着会让重连时把上一轮的
ICE candidate 重放一遍,表现是「偶尔连不上,重试就好了」这种最难查的问题。

### 3.3 接口

全部要求已登录(复用 `getCurrentUser()`),并且**全部要限流**(复用 `rate-limit.ts`)。

| 路由 | 作用 | 调用频率 |
| --- | --- | --- |
| `POST /api/coop/heartbeat` | 上报在线 + 拉取自己的房间状态和待处理邀请 | 菜单页 3 秒 |
| `GET  /api/coop/online` | 在线且 idle 的用户列表(分页,最多 50) | 随心跳 |
| `POST /api/coop/invite` | 邀请某人,建房 | 用户点击 |
| `POST /api/coop/respond` | 接受 / 拒绝 | 用户点击 |
| `POST /api/coop/signal` | 投递一条 SDP / ICE | 握手期间 |
| `GET  /api/coop/signal` | 取走并删除发给我的信令 | 握手期间 1 秒 |
| `POST /api/coop/leave` | 主动退出 / 上报结束 | 局末或断线 |

**心跳把「在线上报」和「拉取邀请」合成一个请求**,不要拆成两个轮询 ——
菜单页每 3 秒两个请求,人一多就是白白翻倍的 DB 压力。

### 3.4 握手

1. 邀请方(host)建房,状态 `pending`。
2. 受邀方在心跳里看到邀请,弹窗;接受 → 房间转 `accepted`。
3. host 收到 `accepted` → 建 `RTCPeerConnection`,`createDataChannel('game')`,
   生成 offer 投递到 `coop_signals`。
4. guest 取到 offer → 设置远端描述 → 生成 answer 投递回去。
5. 双方互相投递 ICE candidate,直到 `datachannel.readyState === 'open'`。
6. 房间转 `connected`,**双方停止一切轮询**,此后只走 DataChannel。

超时:**从邀请发出算起 30 秒**没到 `connected` 就判失败,清房、双方回 idle。
不要无限等 —— 连不上时用户唯一的诉求是尽快知道连不上。

## 4. 局内协议(走 DataChannel)

### 4.1 权威划分

**host 权威。** 邀请方是 host,负责:

- 波次推进、敌机生成(含全部随机参数)、Boss 阶段
- **敌机死亡的最终裁决**
- 道具掉落与归属
- 局末判定

guest 负责:自己的飞机、自己的开火、把命中上报给 host。

这样划分的理由:两端各自判定击杀必然出现「我打爆的敌机在你屏幕上还活着」。
必须有一方说了算,而 host 天然是发起方。

### 4.2 消息表

时间戳 `t` 一律用**共享时钟**(§4.4),单位毫秒。

| 方向 | 类型 | 载荷 | 频率 |
| --- | --- | --- | --- |
| 双向 | `pos` | `x, y` | 20 Hz |
| 双向 | `fire` | `t, x, y, weapon` | 跟随射速,约 7/s |
| host→ | `wave` | `index, kinds[]` | 每波一次 |
| host→ | `spawn` | `id, kind, x, phase, diveAt, vx, fall` | 每敌机一次 |
| host→ | `efire` | `enemyId, angle, speed` | 事件 |
| host→ | `sync` | `[{id, x, y}]` | **4 Hz**,见 §4.3 |
| host→ | `dead` | `id, by`(谁打的,用于计分归属) | 事件 |
| host→ | `power` | `id, kind, x, y` / `taken: id, by` | 事件 |
| →host | `hit` | `enemyId, damage` | 事件 |
| 双向 | `state` | `score, lives, weapon, shield` | 1 Hz + 变化时 |
| 双向 | `bye` | `reason` | 一次 |

**子弹不同步。** 玩家子弹是匀速直线,收到 `fire` 事件后本地生成即可,两端轨迹一致。
逐帧同步子弹是这类游戏里最容易犯的带宽错误 —— 射速 7/s、每颗存活约 1 秒,
逐帧同步等于每秒几百条消息,而它们本来就是可推算的。

估算总带宽:`pos` 20Hz × 两端 + 事件,**不到 2 KB/s**。

### 4.3 漂移校正

敌机由两端各自按 `spawn` 参数本地模拟,但 Phaser 的 Arcade 积分依赖每帧 dt,
两端帧率不同必然缓慢漂移。host 以 **4 Hz** 广播全部存活敌机的 `sync` 位置,
guest **不硬设位置**,而是朝目标插值(每帧收敛约 20%)——
硬设会让敌机每 250ms 抖一下,比漂移本身更难看。

偏差超过 60px 才硬设(说明已经不是漂移而是丢事件了)。

### 4.4 共享时钟

连上后 guest 发 5 次 `ping`,host 原样回 `pong` 带自己的 `t`,
guest 取往返最短的那次估算 `offset = hostT + rtt/2 - localT`,此后 `sharedNow() = now + offset`。

**不做持续时钟同步。** 一局几分钟,浏览器时钟漂移可以忽略;
持续校正反而会让 `diveAt` 这类到点触发的事件在校正瞬间跳变。

### 4.5 计分与生命

- **分数各算各的**:`dead` 事件里的 `by` 决定这一杀记给谁。结算页并列显示两人分数。
- **生命各算各的**:一方阵亡进入观战(飞机变半透明、不参与碰撞),等本波结束复活。
  **不做「一方死了整局结束」** —— 那会让弱的一方毁掉强的一方的体验,是协作模式最劝退的设计。
- 排行榜(`neon-strike-2d-best`)**只记单人成绩**。联机局不写榜 ——
  两人合力的分数和单人分数不可比,混在一起榜就废了。

## 5. 断线

**host 掉线 = 本局结束**,guest 直接进结算页,显示「队友掉线」。
不做 host 迁移 —— 迁移要把整套权威状态(波次进度、敌机列表、Boss 血量)搬过去,
复杂度远超本期收益。

**guest 掉线 = host 转为单人继续打完**,不打断 host 的这一局。

判定:DataChannel 的 `close` / `error`,或 **3 秒**收不到对方任何消息。
`pos` 是 20Hz 的,3 秒空窗一定是断了。

任一方结束都要 `POST /api/coop/leave` 把房间置 `ended`、presence 置回 `idle` ——
漏了这一步的表现是「这个人明明没在玩,却一直显示 busy 邀请不了」。

## 6. 代码落点

```
src/games/neon-strike-2d/
  coop/
    net.ts        RTCPeerConnection + DataChannel 封装,对外只暴露 send/on/close
    protocol.ts   §4.2 的消息类型定义,双方共用
    session.ts    局内同步:发自己的、收对方的、漂移校正、断线判定
    lobby.ts      在线列表 / 邀请 / 握手的轮询与状态机
  scenes/
    MenuScene.ts  加「联机」入口和邀请弹窗
    GameScene.ts  加第二架飞机 + 权威分支

src/app/api/coop/*  §3.3 的接口
scripts/db/schema.sql  §3.2 的三张表
```

**`GameScene.ts` 现在 899 行,不要在里面直接铺联机逻辑。**
它已经承担了波次、Boss、道具、粒子、HUD;再塞进同步和权威判定会没法维护。
联机状态全部收在 `coop/session.ts`,GameScene 只调它的接口、只多一处
「我是不是 host」的分支。

**单人模式必须一行不改地照常跑。** 没有 `coop/session.ts` 实例时,
所有联机分支短路,行为和现在完全一致 —— 这是验收的第一条。

## 7. 验收

1. **单人模式行为与改造前完全一致**(最重要的一条)。
2. 两台设备能看到彼此在线、邀请、接受、进入同一局。
3. 双方屏幕上敌机的数量、位置、死亡时机一致(允许 60px 内的漂移)。
4. 一方击落的敌机,另一方屏幕上同时消失,不会出现「打不死的残影」。
5. 一方阵亡不影响另一方继续打。
6. host 掉线 → guest 进结算;guest 掉线 → host 单人继续。
7. 任一方退出后,双方 presence 都回到 `idle`,能被再次邀请。
8. 连接失败(NAT 穿透不过)时有明确提示,不是无限转圈。
9. 联机局不写入单人排行榜。
10. 握手完成后,**不再有任何 HTTP 轮询**(用 Network 面板确认)。
