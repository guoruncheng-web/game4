# 当前前后端边界（2026-09-06 更新）

PWA 主仓已移动到工作室 `frontend/`，所有公共 API、鉴权签发、数据库与权威联机逻辑归同级 `backend/` NestJS monorepo。后文账号/API/server 路径表是迁移前的历史说明，现行实现及启动方式以 `../backend/README.md` 为准，不要按旧路径重新创建业务后端。

前端使用 `pnpm dev` / `pnpm start` 启动 `tools/pwa-server.mjs`：页面交给 Next，HTTP API rewrite 与 WebSocket 宿主转发统一指向网关。WebSocket 必须正确转发非 101 的鉴权拒绝响应；不能恢复成会悬挂拒绝握手的默认 rewrite。头像 GET 现在也要求网关验证登录 Cookie，业务 API 均 no-store。前端不得持有 AUTH_SECRET / DATABASE_URL。

# CLAUDE.md

## 项目定位

**游戏盒子(game box)**:一个 Next.js 站点承载多款互相独立的小游戏。
`src/app/page.tsx` 是根容器(游戏列表首页),每款游戏占一个路由 `src/app/<slug>/page.tsx`。

技术栈:Next.js 16(App Router + Turbopack)、React 19、Tailwind v4、Phaser 3、TypeScript strict、pnpm。
路径别名 `@/*` → `src/*`。代码注释用中文。

## 目录规范

```
src/
  app/
    layout.tsx            全站外壳
    page.tsx              游戏盒子首页(服务端组件),遍历 registry 渲染入口卡片
    star-runner/page.tsx  一款游戏的页面 = 一个路由
    <slug>/page.tsx       下一款游戏,以此类推
  games/
    registry.ts           游戏清单(纯元数据)
    types.ts              GameModule 契约
    star-runner/
      index.ts            必须导出 startGame(parent: HTMLElement): Phaser.Game
      config.ts           尺寸与手感常量
      textures.ts         运行时生成贴图
      sfx.ts              WebAudio 音效
      scenes/             Boot / Menu / Game / GameOver
  components/
    GameShell.tsx         游戏页共用外壳(标题 + 返回首页)
    PhaserCanvas.tsx      通用 Phaser 挂载容器
```

**一款游戏的全部代码都放在 `src/games/<slug>/` 内,不允许跨游戏 import。**
公共能力上提到 `src/components/` 或 `src/games/` 顶层,不要让一款游戏去 import 另一款的东西。

`<slug>` 三处必须一致:目录名 `src/games/<slug>`、路由 `src/app/<slug>`、`registry.ts` 里的 `slug` 字段。

### slug 命名规则

**用游戏本身的名字,不要用 `game1` / `game2` 这种序号占位名。**
slug 是对外的 URL(`/star-runner`),序号既不表意、也会在游戏增删后彻底失序。

- 小写 kebab-case,取游戏英文名:`star-runner`、`block-puzzle`、`tower-defense`。
- 与 `registry.ts` 里的 `title`(展示名,如 `Star Runner`)对应,但 slug 只用 ASCII 小写和连字符。
- 已经存在的 slug 不要再改——它是 URL,也是 localStorage key 的前缀(见下)。

游戏内的持久化 key 统一加 slug 前缀,避免多款游戏互相覆盖,例如 `star-runner-best`。

## 新增一款游戏的步骤

1. `src/games/<slug>/index.ts` 导出 `startGame(parent): Phaser.Game`(符合 `GameModule`)。
2. `src/games/registry.ts` 的 `GAMES` 数组里追加一条元数据。
3. `src/app/<slug>/page.tsx` 照 `star-runner` 抄:

```tsx
'use client';

import dynamic from 'next/dynamic';
import GameShell from '@/components/GameShell';
import { getGame } from '@/games/registry';

const meta = getGame('<slug>')!;

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), {
  ssr: false,
  loading: () => <div className="…">加载中…</div>,
});

export default function Page() {
  return (
    <GameShell title={meta.title} subtitle={meta.controls}>
      <PhaserCanvas load={() => import('@/games/<slug>')} />
    </GameShell>
  );
}
```

**首页不会自动出现卡片,必须手动改 `src/app/page.tsx`。**
`page.tsx` 是一张手写的卡片墙(每款游戏一段硬编码 JSX + 自己的配图/emoji/存档读取),
不是遍历 `GAMES` 渲染的 —— 早期版本是,后来改成定制布局之后就不是了。
registry 现在只服务于 `manifest.ts` 的快捷方式(取前 4 条)和各游戏页自己的 `getGame(slug)`。

所以新增一款游戏要动的地方是 4 处:`src/games/<slug>/`、`src/app/<slug>/page.tsx`、
`registry.ts`、以及 `src/app/page.tsx` 里补一张卡片。

## 两套引擎并存

盒子里同时有 Phaser 3 和 Three.js 两种游戏,各走各的挂载容器,互不影响:

| slug | 引擎 | 容器 | 契约 |
| --- | --- | --- | --- |
| `star-runner`、`fruit-slasher`、`neon-strike-2d`、`ludo` | Phaser 3 | `PhaserCanvas` | `GameModule`,`startGame` 返回 `Phaser.Game` |
| `neon-strike`、`eight-ball`、`triple-pile`、`fish-hunter` | Three.js | `ThreeCanvas` | `ThreeGameModule`,`startGame` 返回 `{ destroy() }` |

`neon-strike` 已重写为 Three.js 版(`three/` 渲染 + `world.ts` 玩法 + `ui/` DOM 覆盖层),
初代 Phaser 竖屏弹幕版原样保留在 `neon-strike-2d`。两版是**各自独立的游戏**:
目录、路由、`public/<slug>/` 资源、localStorage key(`neon-strike-*` vs `neon-strike-2d-*`)全部分开,
不允许互相 import;改其中一版不需要同步另一版。
唯一的共用是 `public/neon-strike/assets/vfx` 各存了一份拷贝(两版都要用那 5 张特效贴图)。

## Phaser 与 SSR 的硬性约束

踩过的坑,改动时务必守住:

- **锁 Phaser 3,不要升 4。** 直接 `pnpm add phaser` 会装到 4.x,而本项目的场景/物理/粒子写法都是按 3 写的。
  升级需要单独评估并做运行时验证,不能只看类型检查过不过(Phaser 4 的类型对这套代码是通过的,但渲染器是重写的)。
- **一律 `import * as Phaser from 'phaser'`,不要 `import Phaser from 'phaser'`。**
  `phaser.esm.js` 只有具名导出、没有 default export,默认导入会让 Turbopack 构建直接失败。
- **`registry.ts` 只放纯元数据,不准 import 任何游戏代码。**
  首页是服务端组件;registry 一旦引用到游戏模块,Phaser 就会被拖进 RSC 依赖图。
- **游戏模块只能通过 `PhaserCanvas` 里的动态 import 进入运行时。**
  Phaser 在模块顶层就会碰 `window`,所以游戏页必须 `dynamic(..., { ssr: false })` 加载 `PhaserCanvas`,
  再由它在 `useEffect` 里 `await load()`。两层隔离缺一不可。
- 卸载时必须 `game.destroy(true)`;`PhaserCanvas` 已用 `cancelled` 标志防住异步竞态。

## Phaser 物理约定

- **重力只在 `Phaser.Game` 配置里设一次**(`physics.arcade.gravity.y`)。
  不要再对玩家 body 调 `setGravityY(PLAYER.gravity)`——会叠加成两倍,手感参数全部失真。
- 需要让某个 body 掉出画面(坠落死亡判定)时,用 `body.setBoundsRectangle()` 给它一套加高的**专属**边界,
  不要改全局 `physics.world` 边界——那会让星星、敌人一起掉出关卡。
- 触屏输入要遍历 `this.input.manager.pointers`(其中 `pointers[0]` 就是鼠标指针),
  不能只读 `activePointer`,否则移动和跳跃无法同时按。记得 `this.input.addPointer(2)`。

## PWA(安装到桌面 + 离线缓存)

- `src/app/manifest.ts` —— 清单走 Next 的 metadata route,快捷方式从 `registry.ts` 自动生成,新增游戏不用改。
- `public/sw.js` —— 手写 Service Worker,三条策略:导航 network-first(兜底 `/offline`)、
  `/_next/static/**` cache-first、游戏素材(上表那些 `public/<slug>/` 下的图/模型/音频)cache-first。
  **素材是玩过才缓存,不做安装时全量预下载** —— 盒子里素材加起来 60MB+,装个图标就吃掉这些流量不合适。
- `src/components/PwaProvider.tsx` —— 注册 SW、安装引导横幅、新版本提示。只在首页弹横幅(游戏页是全屏画布)。
  iOS 不派发 `beforeinstallprompt`,那条分支给的是「分享 → 添加到主屏幕」的图文引导。
- **开发模式不注册 SW**(dev 的 chunk 每次编译换名字,缓存它们会让 HMR 拿到旧文件)。
  验证离线效果要 `pnpm build && pnpm start`。
- 图标产物在 `public/icons/`,改图形后重跑 `pnpm icons`(源是 `tools/pwa/build-icons.mjs` 里的内联 SVG,
  产物一律 PNG:iOS 不吃 manifest 里的 svg,安卓的 maskable 裁切也只认位图)。
- 改了 `sw.js` 的缓存策略,记得同时把里面的 `VERSION` 加一档,否则旧缓存不会被清。

## 账号与会话

产品形态是**一键开号**:后端直接生成 `player-xxxxxx` + 12 位随机密码,弹窗只显示这一次。
没有邮箱,所以**没有找回流程** —— 前端弹窗必须一直把这句话说死,并且要用户勾选确认才让关。

| 位置 | 作用 |
| --- | --- |
| `src/lib/auth.ts` | 密码 scrypt 哈希、会话 token 签发/校验、cookie 选项 |
| `src/lib/captcha.ts` | 手写 PNG 编码器 + 点阵字模生成验证码,答案不落库 |
| `src/lib/session.ts` | `getCurrentUser()`,顺带比对 token_version |
| `src/lib/rate-limit.ts` | 内存限流 + 登录失败计数 |
| `src/app/api/auth/*` | register / login / logout / me / password / captcha |
| `scripts/db/schema.sql` | `users` 表,`node --env-file=.env.local scripts/db/init.mjs` 建表(幂等) |

守住这几条:

- **会话是无状态签名 cookie,靠 `users.token_version` 撤销。** payload 是 `id.版本号.过期时间`;
  登出和改密码都会把库里的版本号 +1,旧 token 立刻失效。改动 token 格式 = 所有人被登出。
- **改密码不验旧密码**,凭据就是那条已登录的会话 cookie。开号发的是随机串,用户基本没记住,
  逼他们抄旧密码等于挡住正常改密。代价是会话被盗即账号被顶掉 —— 所以 session cookie 的
  httpOnly / sameSite 和改密接口的限流都不能拿掉。
- **密码进 scrypt 之前必须先卡长度**(`MAX_PASSWORD_LENGTH`)。scrypt 是同步且刻意慢的,
  一个超长密码就是一次免费的 DoS。
- **验证码是一次性的**:cookie 里签的是 `nonce.过期时间.签名`,校验通过就把 nonce 记进内存黑名单。
  签名对不上不消费 nonce —— 否则用户输错一次就得换图。
- **登录连错 3 次(按 IP 和用户名各记一份,取大者)之后必须带验证码**,响应里会带 `requireCaptcha`,
  前端据此把验证码框补出来。登录成功要把失败计数和限流桶一起清掉。
- **限流和 nonce 黑名单都是每实例一份的内存结构**,Serverless 下不是安全边界,只是门槛。
  真要扛撞库得换共享存储(Upstash Redis 之类)。
- 验证码画图**不许引 node-canvas / @napi-rs/canvas** —— 带原生二进制,而这个仓库的 node_modules
  是 Mac 和 Linux 两台机器共用的,原生包必然在其中一边缺文件。PNG 用 Node 自带 zlib 手写就够了。
- 接口冒烟测试:起 dev server 后
  `node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts` 铺测试账号,
  `node scripts/db/e2e-auth.mjs http://127.0.0.1:3000` 跑,跑完 `seed-e2e.mts --clean` 清掉。
  头像那套单独有一个:`node tools/sim/avatar-upload-test.mjs http://127.0.0.1:3000`。

### 头像

每个账号都有 `users.avatar`(注册时随机发的 emoji,永远不为空),再叠一层可选的上传图片。

| 位置 | 作用 |
| --- | --- |
| `user_avatars` 表 | 图片字节(bytea)、mime、宽高 |
| `users.avatar_version` | 进 URL 的版本号,决定缓存 |
| `src/lib/avatar.ts` | 服务端校验:按魔数认格式、读文件头拿尺寸 |
| `src/lib/avatar-encode.ts` | 浏览器端裁方 + 缩放 + 编码 |
| `src/app/api/avatar/route.ts` | POST 上传 / DELETE 还原 |
| `src/app/api/avatar/[uid]/route.ts` | 公开读图 |
| `src/components/Avatar.tsx` | 站内统一渲染(有图用图,没图用 emoji) |
| `src/components/AvatarUploader.tsx` | "我的"页里的换头像控件 |

守住这几条:

- **缩放裁剪在浏览器里做,服务端只校验。** 服务端做这件事要 sharp / node-canvas 这类
  原生依赖,而 node_modules 是 Mac 和 Linux 共用的,原生包必然在其中一边缺文件
  (和验证码手写 PNG 编码器是同一个理由)。
- **认格式只认魔数,不信 Content-Type。** 并且必须从文件头解析真实宽高 ——
  20000×20000 的纯色 PNG 压完只有几十 KB,能过字节数检查,却会撑爆每个渲染它的浏览器。
- **`avatar_version` 的编码是"正数 = 有图,绝对值 = 换过几次;≤0 = 用 emoji"。**
  删头像时取负而不是清零:清零的话下次再传又是 `?v=1`,而浏览器里那条 immutable
  缓存还在,新头像会被旧图顶掉,且过不了期、用户自己刷新也没用。
- **`/api/avatar/[uid]` 是公开接口**(`<img>` 带不上 Bearer 头),版本号对不上时 302 到正确 URL,
  不能直接把新图塞给旧 URL —— 那等于让旧 URL 把新图缓存住。
- 新增任何"返回用户"的接口,记得跟着带 `avatarUrl`,并用 `<Avatar>` 渲染,
  别再手写 `{user.avatar}` —— 头像出现在六个地方,散着写必然漏。
- **Cocos 游戏(十三张 / UMO)里的座位头像仍然只吃 emoji**:它们的房间协议把 avatar
  截断到 16 字符,要支持图片得改 ws 协议和两个 Cocos 工程,是单独一件事。

## 资源约定

现有游戏的贴图用 `Graphics.generateTexture()` 生成、音效用 WebAudio 振荡器合成,
不依赖任何外部图片/音频文件。新游戏优先延续这个做法;确需静态资源时放 `public/<slug>/`。

## 命令

```bash
pnpm dev      # 开发
pnpm ws       # 联机 WebSocket 服务(另开一个终端,联机功能必需)
pnpm build    # 生产构建(会跑 tsc 类型检查)
pnpm lint
```

**联机要两个进程。** `server/ws.mjs` 是独立的 WebSocket 服务,`pnpm dev` **不会**带起它 ——
只跑 dev 的话,页面会一直显示「正在连接联机服务」并无限重连(开发模式下会提示你跑 pnpm ws)。
线上是两个 systemd 单元:`gameai`(Next)和 `gameai-ws`(WebSocket),见 `deploy/README.md`。

- 本仓库用 pnpm;非交互环境下执行 `pnpm install` 需要 `CI=true`。
- **不要用裸 `tsc --noEmit` 当作类型检查通过与否的判据。**
  `layout.tsx` 用了 `LayoutProps<"/">`,这个类型由 Next 在构建时生成到 `.next/types`,
  单跑 tsc 必然报 `Cannot find name 'LayoutProps'`。以 `pnpm build` 的结果为准。

## 岗位 agent

Codex 使用 `.codex/agents/*.toml`;Claude Code 兼容副本保留在 `.claude/agents/`。共有三个岗位:

- **`game_producer`(游戏产品)** —— 下一款做什么、核心循环、机制规则、难度曲线、手感参数、范围控制。
  产出 `src/games/<slug>/DESIGN.md`。
- **`game_artist`(游戏视听:美术 + 音效)** —— 视觉风格、配色、画面可读性、动效与音效表现规格、素材产出路线。
  产出 `src/games/<slug>/ART.md`,并可直接实现 `textures.ts`、`sfx.ts` 和配色常量。
- **`game_vfx_designer`(游戏特效)** —— 粒子、拖尾、爆发、转场、Effekseer、Three.js/Phaser 动效、关键帧同步与移动端性能。
  可实现纯表现特效组件与参数并维护 `ART.md`,不修改玩法规则。
- **`game_audio_designer`(游戏音效)** —— SFX、WebAudio 时间轴、rFXGen/本地生成式音频、分层混音、响度检查与 `SOUND.md`。
  可实现音频调度、生成脚本和音频资源,不修改玩法规则。
- **`playtest_critic`(试玩批评)** —— 静态推演找「build 通过但游戏是错的」那类问题:
  参数实际生效值与声明不符、永远触发不到的判定、状态组合卡死、退化打法、重启泄漏。
  **玩法改动后跑一遍防回归。** 它只报告,不改代码。

分工边界:产品定「这里该有什么反馈」,美术定「这个反馈长什么样」,试玩批评查「实际跑起来是不是这样」。
三者都不写玩法实现代码 —— 场景、物理、规则判定由主对话或实现方负责。

## 资源生成
- 会部署一个云主机,这个主机上装了comfyui 可以用它来生成游戏需要的素材
- comfyui 不需要提交到github上面
- 页面中所有图标和图片尽量使用内置的image去生成,不用用svg
- 我本地安装了belender 可以使用这个生成3d素材
- 霓虹突击的 3D 模型由 `tools/blender/neon-strike/build_models.py` 无头生成(敌机 / Boss / 三种场景结构物),
  改了脚本要在装了 Blender 的机器上重跑:
  `blender -b --python tools/blender/neon-strike/build_models.py -- public/neon-strike/models`
  产出的 glb 进仓库;结构物(`prop-*.glb`)缺失时 Stage 会自动回落到程序化柱体,
  障碍物(`obstacle-*.glb`)缺失时这一局就没有障碍物 —— 都不会报错、不会开不了局
- 叠叠消(triple-pile)的 12 个火锅食材模型由 `tools/blender/triple-pile/build_models.py` 无头生成:
  读 `src/games/triple-pile/assets/source/*-chroma.png`(品红抠像的正视图渲染)→ 抠像 + alpha bleed +
  降采样 → 按形体建低模 + 平面投影 UV → `public/triple-pile/models/*.glb`(贴图内嵌,约 4.3MB)。
  `blender -b --python tools/blender/triple-pile/build_models.py`
  改完用 `preview.py` 渲两张验收图(正视图应该和源图几乎一样)。
  **改脚本前先读 `src/games/triple-pile/ART.md` §0**,那里写了这套方案成立的三条前提和踩过的四个坑
  (图元自带 UV 层、UV 球极点、Blender Z-up vs glTF Y-up、抠像残留必须 bleed)。
  模型缺失时游戏直接报错,不做回落 —— 食材就是这个游戏本身。
- 可以使用 rFXGen 来生成游戏音效，我在本机(mac)上安装好了
  (`~/Applications/rFXGen/rfxgen_v5.0_macos/rfxgen.app/Contents/MacOS/rfxgen`,支持 `--input x.rfx --output x.wav --format 44100,16,1` 无 GUI 渲染;
  Linux VM 里可以 `ssh mac@192.168.64.1` 直接调它)
- 霓虹突击的音效由 `tools/audio/neon-strike/build_sfx.mjs` 生成:
  脚本写出 `presets/*.rfx`(rFXGen 原生参数文件)→ 调 rFXGen 渲染每一层 → 混层 + 峰值归一 → `public/neon-strike/assets/audio/*.wav`。
  `node tools/audio/neon-strike/build_sfx.mjs --ssh mac@192.168.64.1`(或 `--rfxgen <二进制路径>` 在 Mac 本地跑)。
  想手调音色就用 rFXGen GUI 打开对应的 `.rfx` 存回原文件,再跑一遍脚本;改了音频文件记得把 `public/sw.js` 的 `VERSION` 加一档
- 可以使用 Effekseer 来生成游戏特效，我在本机(mac)上安装好了
- 对于threejs开发的游戏可以使用 three-nebula 生成素材
- 对于threejs开发的游戏可以使用 Phaser3-Particle-Editor 生成素材


## cocos-mcp(控制 Cocos Creator 的 MCP)

**和这个游戏盒子没有关系,是一套独立工具** —— 盒子里的游戏是 Phaser 3 / Three.js,
这个 MCP 管的是 Cocos Creator 项目。记在这里只是因为它在同一台机器上、同一批会话里做的。

| 位置 | 路径 |
| --- | --- |
| 仓库(Linux) | `/home/jojo/work/cocos-mcp` |
| 仓库(Mac) | `/Users/mac/projects/cocos-mcp` —— **和上面是同一份**,两边共享文件系统 |
| 桥扩展 | `extension/`,要拷到**每个 Cocos 项目**的 `extensions/cocos-mcp-bridge` |
| 说明书 | 仓库里的 `README.md`,踩过的坑都记在那儿 |
| 对接说明 | `src/games/ludo/COCOS.md` —— 注册到 Codex、操作纪律、已知的坑,以及 Ludo 的 Cocos 版交接 |

注册(Claude Code 在 Linux、Cocos 在 Mac,所以用 ssh 转发 stdio):

```bash
claude mcp add cocos -- ssh -o BatchMode=yes mac@192.168.64.1 \
  '/opt/homebrew/bin/node /Users/mac/projects/cocos-mcp/src/index.mjs'
```

39 个工具,分三组:

- **项目与构建**(不需要编辑器):列引擎/项目、建项目、构建、读编辑器日志、项目设置。
- **场景**(要编辑器开着):节点树、增删改节点、组件、属性、数组属性、预制体、新建场景、
  `run_game`(headless 跑起来抓运行时异常)。
- **资源库**(要编辑器开着):路径↔uuid 互查、建脚本、导入图片/音频/模型、刷新。

已经验证跑通的完整链路:**写脚本 → 建场景节点 → 设资产引用 → 存预制体 →
Tween 动画 → run_game 验证 → 构建 → 产物在独立服务器上真的跑起来**。

用之前必须知道的几条(全是实测踩出来的,详情看它的 README):

- **桥扩展必须装在项目的 `extensions/` 下**,放 `~/.CocosCreator/extensions` 全局目录不会被加载。
- **改动只在编辑器内存里,不调 `save_scene` 就不落盘。**
- **「没报错」不等于「功能对」。** 用 `run_game` 的断言表达式去验证功能真的生效 ——
  踩过最狠的一次是手写 `.anim`:文件建了、导入了、`playing` 也是 true,节点纹丝不动。
  (程序化做动画请用 Tween 脚本,不要生成 `.anim`。)
- **发布前一定给 `build_project` 指定 `startScene`**,否则启动场景跟着"编辑器最后打开的那个"走。
- 编辑器弹对话框时**所有场景工具都会超时,而 `scene_status` 仍说就绪** ——
  这时用 `check_dialog` 看一眼。

# nodel_modules 目录安装依赖只能我在mac上面自己安装,不用你在linux帮我安装
