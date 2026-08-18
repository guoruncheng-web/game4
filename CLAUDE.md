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

首页会自动出现新卡片,不需要改首页代码。

## 两套引擎并存

盒子里同时有 Phaser 3 和 Three.js 两种游戏,各走各的挂载容器,互不影响:

| slug | 引擎 | 容器 | 契约 |
| --- | --- | --- | --- |
| `star-runner`、`fruit-slasher`、`neon-strike-2d` | Phaser 3 | `PhaserCanvas` | `GameModule`,`startGame` 返回 `Phaser.Game` |
| `neon-strike` | Three.js | `ThreeCanvas` | `ThreeGameModule`,`startGame` 返回 `{ destroy() }` |

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

## 资源约定

现有游戏的贴图用 `Graphics.generateTexture()` 生成、音效用 WebAudio 振荡器合成,
不依赖任何外部图片/音频文件。新游戏优先延续这个做法;确需静态资源时放 `public/<slug>/`。

## 命令

```bash
pnpm dev      # 开发
pnpm build    # 生产构建(会跑 tsc 类型检查)
pnpm lint
```

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
- 可以使用 rFXGen 来生成游戏音效，我在本机(mac)上安装好了
- 可以使用 Effekseer 来生成游戏特效，我在本机(mac)上安装好了
- 对于threejs开发的游戏可以使用 three-nebula 生成素材
- 对于threejs开发的游戏可以使用 Phaser3-Particle-Editor 生成素材