# 叠叠崩（Tumble Stack）技术架构

> 本文档只谈工程实现，玩法规则与数值见同目录 `DESIGN.md`。
> 两份文档的分工：`DESIGN.md` 定「游戏应该是什么样」，本文定「代码怎么组织才能撑住它」。

## 0. 实现前必须先做的验证（阻塞关卡）

**在写任何正式代码之前，先写一个 10 行的 demo 验证这一条**：

> Rapier 的 island 进入休眠后，narrow phase 的 contact pair 是否仍然保留？

`DESIGN.md` §7 的整套消除判定建立在「能持续查询到稳定堆里的接触对」之上。如果休眠体的接触对会消失，表现是**堆稳定下来之后反而不消除** —— 这是最恶劣的一类 bug：build 通过、跑起来大部分时候正常、只在堆静止后失效。

验证方法：建两个相邻静止的方块，等它们休眠（`body.isSleeping() === true`）后再调 `world.contactPairsWith`，看还能不能拿到 `numSolverContacts() > 0`。

兜底方案二选一，验证结果决定走哪条：
1. `setCanSleep(false)`，代价是 CPU 常驻；
2. 一旦某对进入稳定态就写入持久邻接表，只在一方被移除或被唤醒时重新校验。

**这条不验证就开工，等于在地基上赌一把。**

## 1. 这一款为什么不能用 Phaser

盒子里现有三款全部基于 Phaser 3。这一款必须换引擎，原因是硬性的：

- **Arcade 物理只有 AABB**，没有旋转、没有任意凸多边形接触点。本作要求「真实碰撞、堆叠、挤压、滚落」，Arcade 直接出局。
- **Matter.js（Phaser 内置）是纯 2D**。它能做 2D 版的堆叠消除，但做不了 3D 渲染。
- **Phaser 3 没有 3D 渲染管线**。`GameObjects.Mesh` 能显示低模并支持透视，但没有场景图、没有材质系统、没有深度排序策略，不是能拿来做游戏的 3D 管线。

结论：**Three.js 渲染 + Rapier 物理**，这一款完全不引入 Phaser。

> **禁止 Phaser 与 Three 共存。** 两个独立的 `requestAnimationFrame` 循环会互相抢帧，是掉帧的直接来源，而掉帧是用户已经提过意见的问题。HUD 用 DOM 覆盖层实现（见 §6）。

## 2. 依赖政策（硬约束）

| 包 | 版本 | 约束 |
| --- | --- | --- |
| `three` | 0.185.x | 按需具名导入，不要 `import * as THREE`（破坏 tree-shaking） |
| `@dimforge/rapier3d-compat` | 0.20.x | **必须是 `-compat` 版，不要换成 `@dimforge/rapier3d`** |

**为什么锁 `rapier3d-compat`** —— 这条按 CLAUDE.md 里「锁 Phaser 3 不要升 4」的规格对待：

- `@dimforge/rapier3d` 以独立 `.wasm` 文件分发，要求打包器配置 WASM loader。Next 16 + Turbopack 上这是未验证的坑，踩了就是构建失败或运行时 404。
- `-compat` 版把 WASM 用 base64 内联进 JS，对打包器零要求；代价是必须 `await RAPIER.init()`，见 §5。
- 后来者「顺手升级成普通版以减小包体」是可预见的行为，所以这条要同时写进 CLAUDE.md。

两个包都只在本路由通过动态 `import()` 进入运行时，首页和另外三款包体零影响。

## 3. `GameModule` 契约改动

现状（`src/games/types.ts`）把返回值写死成 Phaser：

```ts
export type GameModule = {
  startGame: (parent: HTMLElement) => Phaser.Game;
};
```

放宽成结构化类型：

```ts
/** 游戏实例只需要能被销毁；Phaser.Game 天然满足这个结构 */
export type GameInstance = {
  destroy: (removeCanvas?: boolean) => void;
};

export type GameModule = {
  startGame: (parent: HTMLElement) => GameInstance;
};
```

- **现有三款一行都不用改**：`Phaser.Game.destroy(removeCanvas?, noReturn?)` 结构上满足 `GameInstance`。
- `PhaserCanvas` 里的 `gameRef.current?.destroy(true)` 调用点不用动。
- `types.ts` 里的 `import type Phaser from 'phaser'` 可以删掉 —— 契约从此不依赖任何具体引擎。
- 组件名 `PhaserCanvas` **保持不变**。它的实际职责是「动态加载 + 挂载 + 卸载时销毁」，与引擎无关；改名收益仅是名字更准，不要和本次功能混在一起做。

## 4. 目录结构

```
src/games/tumble-stack/
  index.ts       导出 startGame(parent): GameInstance —— 唯一对外入口，负责生命周期编排
  config.ts      全部可调参数（物理、尺寸、配平、手感、时间常数），纯数据无逻辑
  rapier.ts      RAPIER 模块的单例加载与缓存（见 §5）
  world.ts       Rapier world、容器 collider、刚体的创建与释放
  scene.ts       Three renderer/scene/camera、共享几何体与材质、光照
  entity.ts      Entity = { id, type, body, collider, mesh, state }，以及 handle→entity 索引
  spawner.ts     下一块的类型抽取与配平、瞄准器、投放
  matcher.ts     接触采样 + 迟滞表 + 并查集 + 消除流水线
  danger.ts      溢出判定与四级预警
  loop.ts        固定步长物理 + 渲染的主循环
  hud.ts         DOM 覆盖层：分数、下一块、预警、结算
  vfx.ts         消除粒子（对象池）
  storage.ts     最高分与统计，key 带 slug 前缀
```

沿用 CLAUDE.md 规范：一款游戏的全部代码在自己目录内，不跨游戏 import。

**`config.ts` 必须是纯数据。** `DESIGN.md` §10 给出的参数表要一比一落到这里，方便按试玩反馈调参而不用翻逻辑代码。

## 5. Rapier 异步初始化如何接进加载流程

这是本作与另外三款在流程上最大的结构差异。

Phaser 那套是 `preload()` → `create()`，加载进度由 Phaser 的 Loader 提供。本作没有 Loader，而且多了一个别的游戏没有的步骤：**等 WASM 编译完成**。

而 `GameModule` 契约要求 `startGame` **同步返回**实例。所以：

```
startGame(parent) 被调用
  ├─ 同步：建 DOM 容器 + 加载画面（纯 DOM，不能用 Three —— renderer 还没建）
  ├─ 同步：返回 GameInstance（此时 destroy 只负责移除加载画面 + 置 aborted 标志）
  └─ 异步：
       1. await loadRapier()          ← WASM 编译，首次约 100~400ms
       2. 建 Three renderer / scene / camera
       3. 建 Rapier world、地板、左右墙
       4. 建共享几何体与材质、粒子池
       5. ★ 若 aborted → 立刻回收步骤 2~4 已建的全部资源并 return
       6. 启动主循环，移除加载画面，把 destroy 换成完整版
```

三条要点：

- **`RAPIER.init()` 全局只做一次。** `rapier.ts` 里用模块级 Promise 缓存：

  ```ts
  let ready: Promise<typeof RAPIER> | null = null;
  export function loadRapier() {
    if (!ready) ready = import('@dimforge/rapier3d-compat').then(async (m) => {
      await m.init();
      return m;
    });
    return ready;
  }
  ```

  **这个 Promise 故意不在 destroy 时释放** —— 它缓存的是已编译的 WASM 模块，重复进出游戏页应当复用。代码注释里要写明这一点，否则会被后来者当成泄漏「修」掉，结果是每次进游戏重新编译 WASM。

- **步骤 5 的中止检查不能省。** 玩家在 WASM 编译期间点返回是完全可能的；不检查就会在已卸载的 DOM 上继续建 WebGL context，直接泄漏一个。
- **destroy 分两个阶段**：初始化完成前是「轻量版」，完成后替换成「完整版」（§8）。两者都必须幂等。

## 6. 为什么 HUD 用 DOM 而不是 Three

分数、下一块预览、预警、结算面板全部用 DOM 覆盖层，不在 Three 场景里画。

- Three 没有文字渲染，要画字得自己做贴图图集或引入额外库 —— 而 neon-strike 已经证明了「每次变化都新建一张文字贴图」是掉帧的直接来源。
- DOM 天然有排版、有无障碍语义、能直接复用 Tailwind。
- 代价是 HUD 与 canvas 分属两个层，需要用和 neon-strike 返回按钮同样的办法对齐（用 CSS 复刻画布的缩放与居中）。本作相机固定、画布比例固定，这件事比 neon-strike 更简单。

## 7. 主循环：物理步进与渲染解耦

**不要把 `world.step()` 直接绑在 rAF 上。** 刚体堆叠对时间步长的稳定性极其敏感，变长的 dt 会让堆抖动甚至穿透。

```
每帧 rAF：
  frameDelta = min(now - last, MAX_FRAME_MS)      // 钳位
  accumulator += frameDelta
  steps = 0
  while (accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
    world.step()
    accumulator -= FIXED_DT_MS
    steps++
    physicsClock += FIXED_DT_MS
  }
  if (physicsClock - lastMatchTick >= MATCH_TICK_MS) { matcher.tick(); lastMatchTick = ... }
  danger.update(frameDelta)
  同步各 entity 的 mesh.position / mesh.quaternion
  renderer.render(scene, camera)
```

- `FIXED_DT_MS = 1000/60`，与 Rapier 默认一致。
- **`MAX_FRAME_MS` 钳位是必须的**：切标签页回来时 delta 可能是几十秒，不钳位会一口气跑几千步，页面直接卡死。这与 neon-strike 里「切标签页吃掉护盾时间」是同一类问题的另一面。
- **`MAX_STEPS_PER_FRAME`（建议 5）也是必须的**：低端机跟不上时，不设上限会进入「越追越慢」的死亡螺旋。追不上就让游戏慢下来，不要让它卡死。
- **消除 tick 挂在物理时钟上，不挂在墙钟上。** `DESIGN.md` §7 的迟滞阈值是按「每 6 个物理步一次」定的；挂墙钟的话掉帧时判定节奏会跟着变，迟滞窗口失真。
- 插值（alpha）先不做，跑通无插值版本再说。

## 8. 资源回收（配合 DESIGN.md §17 使用）

浏览器对 WebGL context 有硬上限（通常 8~16 个）。不回收的话反复进出游戏页几次就白屏，而且**只玩一次完全看不出来**。

`destroy()` 的骨架：

```
1. 置 destroyed 标志（幂等的第一道闸门，已置位则直接 return）
2. cancelAnimationFrame
3. 移除全部事件监听：pointer* / keydown / resize / visibilitychange
4. 清理所有 setTimeout / setInterval（消除动画、连锁窗口、预警计时）
5. 遍历 entities：先 world.removeRigidBody，再置空 JS 引用
6. world.free()          ← Rapier 是 WASM，内存不归 JS GC 管，不 free 就是真泄漏
7. dispose 全部 geometry —— 共享几何体要去重，同一个只能 dispose 一次
8. dispose 全部 material（及其上的 texture）
9. renderer.dispose()
10. renderer.forceContextLoss()   ← 不能省，只 dispose 可能仍保留 context
11. renderer.domElement.remove()
12. 移除 HUD 的 DOM 节点
13. 清空所有 Map / 数组，断开闭包对场景的引用
```

**不要释放** `rapier.ts` 里的模块级 Promise（见 §5）。

**验收**：连续进出游戏页 20 次，观察是否出现 `Too many active WebGL contexts` 或白屏；用内存快照确认 mesh / rigidBody 数量没有累积。

## 9. 输入层结构

产品决策是**薄井 2.5D**（`DESIGN.md` §4），这对架构的影响比看起来大：**输入只有一个自由度**。

- 屏幕 X → 世界 X 的映射是一条一维线性变换，不需要射线拾取（raycast），不需要拖拽平面求交。
- 瞄准器是一个独立于物理的纯视觉对象，不建刚体。
- 相机固定（`DESIGN.md` §5）意味着**这条映射是常量**，可以在初始化时算好，不必每帧重算。

```
worldX = clamp((clientX - rect.left) / rect.width * WELL_WIDTH - WELL_WIDTH / 2,
               -WELL_HALF + blockHalfW, WELL_HALF - blockHalfW)
```

夹取边界要按**当前这一块的半宽**算，不是常量 —— 否则宽块会卡在墙里生成。

触屏与键鼠走同一条「设置 aimX → 投放」的路径，只是事件源不同；不要写两套投放逻辑。

## 10. 相机：不需要控制器

`DESIGN.md` §5 定的是完全固定的相机。**这是本作最省事的一个决定**，架构上直接砍掉一整个模块：没有跟随、没有插值、没有晕眩控制、没有过渡状态机。

- 相机参数在 `scene.ts` 里一次性设定，之后只读。
- 唯一允许的运动是屏震，且**必须是平移型，禁止旋转型**；衰减结束后要硬性把 position 归位到常量，不能依赖 tween 的终值 —— 浮点残留会让画面永久歪掉。
- `resize` 时只更新 `renderer.setSize` 与 `camera.aspect`，机位不动。

## 11. 接触判定的数据结构

对应 `DESIGN.md` §7。这是本作唯一复杂的数据结构，单独说清楚。

```ts
type PairKey = number;            // min(idA,idB) * 1e6 + max(idA,idB)
type PairState = { age: number; miss: number };

const pairs = new Map<PairKey, PairState>();
```

每个 match tick（每 100ms / 6 个物理步）：

1. **采样**：遍历存活 entity，用 `world.contactPairsWith` + `numSolverContacts() > 0` 采出本 tick 的接触对；只处理 `idA < idB` 的一半，只处理同类型对。
2. **迟滞更新**：本 tick 采到 → `age++`、`miss = 0`；未采到 → `miss++`，`miss >= 2` 则删除。
3. **取稳定边**：`age >= 3` 的对。
4. **并查集**：只在稳定边之间连边，求连通分量。
5. **消除**：`size >= 3` 的分量按 size 降序取前 3 组，同 tick 内已标记的 entity 不再进入第二组。

两个容易写错的地方：

- **迟滞必须两头都做。** 只做进入门槛会漏触发（稳定堆里偶发 1 帧接触丢失就把 age 清零），只做退出门槛会误触发（落体擦过即算数）。
- **entity 被移除时必须清掉它参与的所有 pairKey。** 不清的话 id 复用后会出现幽灵边 —— 建议 entity id 单调递增不复用，从根上消掉这个风险。

并查集每 tick 从稳定边全量重建即可（场上物体数量有上限，这点开销远小于维护增量结构的复杂度和出错概率）。

## 12. 消除流水线不是递归

`DESIGN.md` §8 的关键结论：消除不是递归函数，是流水线上一个**有界步骤**。

- 单 tick 最多消 3 组 → 天然没有死循环，不需要「等物理稳定」的状态机。
- 300ms 的接触进入门槛本身就是稳定等待期。
- **刚体在第 0ms 移除，网格保留 140ms 播动画。** 反过来做（等动画播完再移除刚体）会让上面的堆悬空再突然掉，因果关系断掉，玩家会读成卡顿。

所以架构上：`matcher.tick()` 是一个纯粹的「输入接触图 → 输出待消除组」的函数，表现层（粒子、动画、计分）由它发出事件驱动，两者不耦合。

## 13. 性能预算

用户已因掉帧提过意见，预算从严：

- **刚体数量设上限**，超过触发压力释放（见 `DESIGN.md`）。刚体数是帧率的第一影响因素。
- **休眠必须开启**（除非 §0 的验证否决了它）。堆稳定后不再参与求解，是这类游戏能跑顺的关键。
- **几何体与材质按类型共享**，每种类型各一个实例。绝不每个物体 new 一个。
- **粒子走对象池**。这条是 neon-strike 的直接教训：每次事件新建 Text / Emitter / Graphics 会攒出可感知的卡顿。
- 无阴影贴图、无后处理、无 bloom。
- `numSolverIterations` 是掉帧时第一个该降的旋钮（`DESIGN.md` §10 给了默认值 8）。

## 14. 风险登记

| 风险 | 后果 | 对策 |
| --- | --- | --- |
| 休眠后接触对丢失 | 堆稳定后反而不消除（最恶劣） | **§0 开工前先验证**，两个兜底方案 |
| WASM 首次编译耗时 | 首次进入有等待 | 加载画面；模块级 Promise 缓存 |
| 高堆叠抖动 | 堆发抖甚至穿透 | 平面约束 + 固定步长 + 低恢复系数 + 质量归一 |
| 切标签页后 delta 爆炸 | 一帧跑几千步、页面卡死 | `MAX_FRAME_MS` 钳位 |
| context 泄漏 | 反复进出后白屏 | §8 清单 + 20 次进出验收 |
| Turbopack 与 WASM | 构建失败 | 锁 `-compat` 版，写进 CLAUDE.md |
| 体量约 1600 行 | 超出盒子里单款常规预算 | `DESIGN.md` §20 的削减版与砍除顺序；五条不可砍项 |

## 15. 落地顺序建议

1. §0 的休眠接触验证 demo（不通过就先改判定方案）
2. 契约放宽 + 一个只有旋转立方体的空场景，跑通挂载 / 卸载 / 20 次进出无泄漏
3. 主循环 + 固定步长 + 容器 + 手动投放单个块（先不做类型与消除）
4. 输入层与瞄准器
5. 类型系统与生成配平
6. 接触判定与消除（本作的规则本体，最难的一块）
7. 塌方连锁与计分
8. 溢出判定与结算
9. HUD、粒子、音效
10. 交 playtest_critic 跑一遍

**第 2 步不要跳过。** 先把生命周期这条最容易埋雷、又最难在后期发现的路走通，再往上堆玩法。
