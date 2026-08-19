# 叠叠消(Triple Pile)技术架构

> 本文只谈工程实现,玩法规则与数值见同目录 `DESIGN.md`,视听规格见 `ART.md`。

## 0. 没有阻塞关卡

`tumble-stack/ARCHITECTURE.md` §0 有一条开工前必须验证的阻塞项
(Rapier 的 island 休眠后 narrow phase 的 contact pair 是否保留)。
**本作不存在这条风险,不要照抄。**

理由:那条风险来自「消除判定依赖持续查询接触对」。本作的消除判定发生在**槽位数组**里,
是纯 JS 的计数逻辑,和物理引擎完全解耦。物理只负责「堆成一堆」和「拿走后塌下来」两件事,
**从不被查询,只被观察**。

反过来,本作**鼓励刚体休眠** —— 堆静止后 Rapier 自动跳过整个 island,这是第 12 关 120 个凸体
能跑到 60fps 的主要依据(`DESIGN.md` §15)。

## 1. 依赖(已就位,无需安装)

| 包 | 仓库现状 | 约束 |
| --- | --- | --- |
| `three` | `^0.185.1` 已在 `package.json` | `import * as THREE`,与 `neon-strike` 保持一致(见 §3.1) |
| `@dimforge/rapier3d-compat` | `^0.20.0` 已在 `package.json` | **必须是 `-compat` 版,不要换成 `@dimforge/rapier3d`** |

`-compat` 把 WASM base64 内联进 JS,对打包器零要求,代价是必须 `await RAPIER.init()`。
普通版以独立 `.wasm` 分发,需要 Turbopack 的 WASM loader 配置 —— 未验证,踩了就是构建失败或运行时 404。
**「顺手升级成普通版以减小包体」是可预见的行为,别做。**

## 2. 契约与挂载(零脚手架改动)

盒子里已经有 Three.js 这一路(`neon-strike`),基础设施全部就位:

- `src/games/types.ts` 已有 `ThreeGameModule`:`startGame(parent) => { destroy(): void }`。
- `src/components/ThreeCanvas.tsx` 已负责动态加载 + 挂载 + 卸载时 `destroy()`。

所以本作**不需要改 `types.ts`、不需要改任何组件**,照 `neon-strike` 的页面写法抄一份路由即可。

注意**不用 `GameShell`**:那是给 Phaser 那几款配的「标题 + 返回」外壳,而 3D 游戏是全屏画布、
HUD 本身就是 DOM。所以路由是一个 `fixed inset-0` 的 `main` + `ThreeCanvas` + 左上角一个返回链接,
和 `src/app/neon-strike/page.tsx` 同构。实际实现见 `src/app/triple-pile/page.tsx`。

**左上角是返回按钮的地盘**,所以局内暂停键放在右上角(`ui/hud.ts`)——
两个圆钮叠在左上角是必然的误触。

`registry.ts` 里追加一条元数据(字段值见 `DESIGN.md` §2)。**不允许 import 任何游戏代码进 registry。**

**禁止 Phaser 与 Three 共存。** 本作完全不引入 Phaser,HUD 用 DOM 覆盖层实现(§6)。

## 3. 目录结构(实现后的实际形态)

```
src/games/triple-pile/
  index.ts          startGame(parent) → { destroy() }。唯一对外出口,状态机也在这里
  config.ts         所有数值常量(物理/相机/槽位/计分/投放),不散落在别处
  pieces.ts         12 类的元数据:key、名称、粒子色、统一质量。**不依赖 Three**
  levels.ts         12 关的关卡表 + 投放序列生成 + 「3 的倍数」断言
  storage.ts        localStorage 读写,全部 try/catch 包住
  sfx.ts            WebAudio 合成音效,零音频文件

  three/
    stage.ts        renderer / 相机 / 光照 / 锅体 / 桌面 / resize / NDC 反投影
    assets.ts       12 个 glb 的加载:取 geometry / material / 凸包顶点
    merge.ts        顶点色几何体的合并工具(只给锅体和桌面用)
    field.ts        12 个 InstancedMesh 的分配、写矩阵、raycast、描边、打白
    tray.ts         槽位条的世界坐标与底板
    vfx.ts          粒子 / 火花 / 冲击波环

  physics/
    world.ts        Rapier 初始化、锅壁 collider 环、刚体增删、固定步长推进

  game/
    tray-logic.ts   槽位的插入/归拢/三消判定/塞满判定。**纯函数,零依赖**
    session.ts      一局的运行时:填料、拾取、飞行、消除、道具、计时、计分

  ui/
    style.ts        注入式 CSS(不走 Tailwind,理由见文件头)
    hud.ts          计时 / 剩余 / 暂停 / 道具按钮 / 开局提示 / 分数飘字
    screens.ts      关卡选择 / 暂停 / 结算
```

**`tray-logic.ts` 必须保持纯函数、零依赖。** 它承载 DESIGN.md §8 的全部正确性
(3 的倍数、塞满判定、可解性),是唯一值得脱离浏览器单独推演的模块。
把它和渲染/物理搅在一起,就没法在不起浏览器的情况下验证崩关 bug。

### 3.1 与本文初稿的三处偏离(以代码为准)

1. **`import * as THREE from 'three'`**,不是按需具名导入。
   理由是跟 `neon-strike` 保持一致 —— 盒子里已有的 Three 游戏就是这么写的,
   而现代打包器对命名空间导入同样能做 tree-shaking。
2. **`ui/` 下是 `.ts` 不是 `.tsx`**。覆盖层用原生 DOM 拼,和 `neon-strike/ui` 一致,
   不引入 React 到游戏运行时。
3. **造型不再由代码生成**。初稿设想的 `three/pieces.ts`(程序化拼形状)已被
   Blender 出的 glb 取代,只剩 `three/merge.ts` 给锅体和桌面用。
   碰撞体也从「手写 collider 表」变成「对模型顶点求凸包」,见 `DESIGN.md` §5.3。

## 4. 状态机

```
boot → levelSelect → filling → playing → (paused) → cleared | failed
```

- `filling`:物件分批落进锅里,**不接受输入**。这是唯一锁输入的阶段。
  批次间隔约 60ms,分 6–8 批,避免 120 个刚体同一帧插入造成一次性求解尖峰。
- `playing`:接受拾取。**飞行动画途中不锁输入**(`DESIGN.md` §6.1)。
- `paused`:物理 step 与计时同时停。
  - **恢复时必须把累积的 `deltaTime` 丢弃**,不能补帧 —— 一次 3 秒的补帧会让整锅炸开。
    实现上:`resume` 时把 `lastTime` 重置为当前时间。这是 `DESIGN.md` §17 第 14 条。
- `cleared` / `failed`:物理继续 step(让最后的塌落自然收敛),但不接受拾取。

## 5. 三个必须写对的地方

### 5.1 instance index ↔ rigidbody 的映射

`InstancedMesh` 用连续的 index 寻址,而物件会**从中间被拿走**。
两种做法,**必须选第二种**:

1. ❌ 拿走时把最后一个 instance 搬到空出的槽位(swap-remove)。
   代价是物件的 instance index 会突变,而飞行动画、高亮、粒子都在引用它 —— 一定出错。
2. ✅ **instance index 一经分配就不变直到本关结束**,拿走的物件把矩阵设成零缩放藏起来,
   同时 `count` 保持不变。每关最多 120 个 instance,浪费的绘制量可以忽略。

映射用两张表:`handleToIndex: Map<number, number>` 和 `indexToPiece: PieceRef[]`。
**拿走物件时必须同时从两张表里清掉**,否则塌落回调会引用到已删除的刚体 —— 这是最容易漏的一处。

### 5.2 拿走物件必须真的移除刚体

```ts
world.removeRigidBody(body);   // 不是 setBodyType(kinematic),不是 setEnabled(false)
```

留着它(哪怕设成 kinematic)会让它在飞行途中继续参与碰撞,把堆撞散。
移除之后这个物件纯粹由动画驱动矩阵,不再有物理身份。

### 5.3 锅壁不能用圆柱 collider

Rapier 的 `cylinder` collider 是**实心凸体**,不能当容器内壁。
用 24 段 `cuboid` 拼一个环(`DESIGN.md` §4.1),每段绕 Y 轴旋转 `i * 2π/24`,
向外偏移 `R + halfThickness`。锅底单独一个 `cuboid`。全部是 `fixed` 刚体。

## 6. HUD 与 3D 的分工

| 元素 | 实现 | 理由 |
| --- | --- | --- |
| 计时、道具按钮、暂停、关卡号 | **DOM 覆盖层** | 文字排版、可访问性、点击区域全部是 DOM 的强项 |
| 槽位里的食材 | **3D InstancedMesh** | 复用同一份 geometry,造型与锅里完全一致(辨识一致性) |
| 槽位底板的 7 个格子 | **3D 面片**(merge 成 1 个) | 必须和 3D 食材在同一个深度空间里,DOM 画不进去 |
| 消除粒子、分数飘字 | 3D | 需要跟随世界坐标 |

DOM 覆盖层用绝对定位盖在 canvas 上,`pointer-events: none` 兜底,只有按钮本身开启点击。
**不要让 DOM 层拦住画布的 pointer 事件** —— 拾取靠的就是画布上的 `pointerup`。

## 7. 资源策略

**食材是 glb,场景是程序化的。** 两条路并存:

| 内容 | 来源 |
| --- | --- |
| 12 个食材 | Blender 生成的 `public/triple-pile/models/*.glb`,贴图内嵌 |
| 锅体、桌面、装饰碟 | 运行时 Three primitive 拼 + 顶点色,merge 成 2 个 mesh |
| 粒子软圆点 | 运行时 64×64 `CanvasTexture` |
| 音效 | WebAudio 合成,零音频文件 |

食材模型的生成管线、验收方法和四个已知的坑写在 `ART.md` §0。改建模脚本前先读那一节。

**模型缺失不做回落。** 食材就是这个游戏本身,少一种就没法开局,
所以加载失败直接报错停在「刷新重试」页,而不是悄悄换成一堆看不出是什么的几何体。
(这一点和 neon-strike 的背景结构物不同,那些缺了只是背景素一点。)

场景静物的 merge 有两个坑(`three/merge.ts` 的文件头也写了):

1. **merge 前把所有输入统一 `.toNonIndexed()`。** 混合 indexed / non-indexed 会产生错误索引。
2. **顶点色不做 sRGB → Linear 自动转换。** 写进 `color` attribute 的浮点数被当作已经是 linear,
   必须先走 `new Color().setHex(0x……, SRGBColorSpace)` 再取 `.r/.g/.b`。
   跳过这一步的表现是颜色明显发白,很容易被误判成「配色没调好」。

## 8. 销毁

`destroy()` 必须做全:

- `cancelAnimationFrame`,并把所有 `setTimeout` 清掉(飞行动画、消除延迟 120ms 都有定时器)。
- 解绑 canvas 上的 pointer 事件与 window 的 resize。
- `renderer.dispose()`;遍历 dispose 所有 geometry 与 material(每类 1 份,共约 10 个)。
- Rapier 的 `world.free()`。**这一步最容易漏** —— WASM 侧的内存不归 GC 管,
  反复进出游戏页会持续泄漏。
- 关闭 AudioContext。

盒子里的游戏页会被反复挂载卸载(返回首页再进来),泄漏会在几次之后表现为卡顿。

## 9. 性能与验证

- 目标:第 12 关满堆(120 物件)Rapier step **< 4ms**,整体 60fps。
- 实现后必须实测,不是拍脑袋。测法:在 `world.ts` 里对 `world.step()` 前后打点,
  取满堆静止前 5 秒的 p95。
- 若超标,按这个顺序调:提高阻尼让堆更快休眠 → 降低 `numSolverIterations` →
  减少物件总数上限(改 `levels.ts`,是纯数据)。**最后才考虑降类型数** —— 那会动玩法。
- `DESIGN.md` §17 的 14 条验收清单是最终判据,尤其第 1、2、4、6 条(崩关与手感红线)。
