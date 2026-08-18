# Eight Ball 3D 素材清单

这一版把 `/eight-ball` 从 Phaser 2D 升级成 Three.js 3D,玩法、规则、AI 全部不变,
只换表现层。这份文件是**素材的唯一出处**:哪些要 AI 生成、哪些要 Blender 出、
哪些必须程序化,以及各自的验收标准。

产物落地:

```
public/eight-ball/textures/    AI 出的贴图(现在只剩 env.webp 一张)
public/eight-ball/models/      Blender 出的 glb
```

> 加了 `public/eight-ball/` 这个目录之后,`public/sw.js` 的 `ASSET_DIRS` 必须补一条
> `'/eight-ball/'`,否则这批素材不会进离线缓存。改完记得把 `VERSION` 加一档。

---

## 一、分工原则

台球这个题材有个反直觉的地方:**大部分东西不该用 AI 出图,也不该用 Blender 建模。**

| 部件 | 方式 | 为什么 |
| --- | --- | --- |
| 16 颗球的球体 | 程序化 `SphereGeometry` | 球必须是完美球体。模型只会引入面数和不圆的风险,16 个实例共享一份几何最省 |
| 16 颗球的**球号贴图** | 程序化 Canvas 2D | 见「四、为什么球号不能用 AI」 |
| 台呢平面 | 程序化 `PlaneGeometry` | 就是个矩形,而且**球能跑的区域必须由代码定义**,不能交给模型 |
| **台呢 / 库边木 / 地板贴图** | **程序化** | 见「二」。第一版走的 AI,拿回来是假无缝,已废弃 |
| **环境反射贴图** | **AI 出图** | 全景光照环境,「看不清细节反而更好」,扩散模型的强项 |
| 台体(库边+袋口+边框+台腿) | **Blender** | 六个袋口豁口用布尔几行搞定,程序化拼会非常痛苦 |
| 球杆 | **Blender** | 锥度渐变、皮头、接箍、分色,程序化质感差一大截 |

---

## 二、程序化贴图(3 张)· `three/textures.ts`

台呢、库边木、地板全部在运行时算出来,**不读任何图片文件**。

### 为什么从 AI 换成程序化

第一版这三张确实让 AI 出过,拿回来的是**镜像四拼的假无缝**:

```
cloth-albedo.png   左右镜像最大差=0   上下镜像最大差=0
rail-wood.png      左右镜像最大差=0   上下镜像最大差=0
floor.png          左右镜像最大差=0   上下镜像最大差=0
```

「最大差 = 0」意味着右半是左半的逐像素精确翻转。工具确实让首尾像素接上了,
但把接缝问题换成了更糟的对称问题:

- 人眼对对称极其敏感。铺到 1.27×2.54m 的台面上,会看到一格一格重复的蝴蝶花纹,
  木纹那张正中间还有一个 ✕ 形的四块交汇结点。
- 有效分辨率砍半,512² 的信息占着 1024² 的体积。
- 四张 PNG 加起来 7.8MB —— `sw.js` 的注释里写过,替用户吃这么多流量不礼貌。

而这三种都是**规则纹理**(各向同性绒面、单方向年轮、几何拼花),正是程序化的强项:
真无缝、零字节、还能按需调色。也跟这个仓库「贴图运行时生成」的一贯做法一致。

### 无缝是数学保证的

不是事后拼的,三条各自成立:

- **噪声**用可平铺 value noise —— 取格点时 `% nx` / `% ny`,右边缘取的就是左边缘那列格点;
- **年轮**用整数频率的 `sin`,一个周期正好铺满一张图;
- **人字拼花**的完整重复单元 `2*M*W = 512` 严格整除贴图边长(已用双倍宽度图案比对验证)。

### 三张各自的要点

| 贴图 | 做法 | 踩过的坑 |
| --- | --- | --- |
| 台呢 | 细绒 + 经纬织向 + 大尺度深浅,三层叠加 | 只有细绒像磨砂塑料,只有大块像刷了漆 |
| 库边木 | 「到年轮线的距离」做窄暗带 | 拿 `sin` 直接当明暗 → 软绵绵的宽条纹,像布帘;扰动幅度超过年轮周期的 ~20% → 年轮被扭成漩涡,糊成迷彩 |
| 地板 | 人字拼花 + 每块板随机色调 | 板缝靠「相邻像素属于不同板」判定并环绕比较,不画网格线 |

---

## 三、AI 出图(1 张)

### `env.webp` · 2048×1024(严格 2:1)· 不需要平铺 · ✅ 已完成

环境反射贴图。**这张最影响成品质感** —— 球体表面的高光和反射全靠它,
没有它 16 颗球会像 16 颗塑料珠子。

```
Equirectangular 360 panorama, HDRI style, dim upscale billiard hall interior,
two warm pendant lamps hanging low overhead casting pools of light,
dark green walls, deep shadows in the corners, soft bokeh, no people,
high dynamic range, clean horizon line, spherical panorama projection
```

负向词:

```
text, letters, numbers, logo, watermark, signature, border, frame, vignette,
people, hands, cue stick, billiard balls, compression artifacts, noise,
flat image, single viewpoint, perspective distortion at poles
```

**验收记录**:真 equirectangular、非镜像(左右差 234)、左右环绕接缝 3.04
(略高,但这张只用于反射,看不出来)。原 PNG 2.10MB,转 WebP q82 后 **58KB**。

> 以后再出这类贴图,一律存 WebP。暗色低细节的全景图上 PNG 极其低效,这次压掉了 97%。

### 颜色基准

程序化贴图和模型都对着 `config.ts` 的 `PALETTE` 走,别各配各的:

| 用途 | 常量 | 色值 |
| --- | --- | --- |
| 台呢 | `cloth` | `#1F7A52` |
| 台呢暗部 | `clothDark` | `#14563A` |
| 库边木 | `rail` | `#5A3320`(偏红棕的桃花心木,不是胡桃) |
| 库边高光 | `railLit` | `#8A5233` |
| 袋口 | `pocket` | `#0A0D10` |

---

## 四、为什么球号不能用 AI

台球最不能错的就是球号和条带位置,而扩散模型恰恰画不准数字 ——
这个仓库自己的 `scripts/queue_game_assets.py` 里,负向词第一条写的就是
`text, letters, numbers`。

所以 16 颗球的贴图**在运行时用 Canvas 2D 画**(白底 + 色环 + 数字圆盘 → `CanvasTexture`):
精确、零字节、还能跟着球的滚动转朝向。

**不要让任何 AI 去画球号贴图。**

---

## 五、法线图

**不要让 AI 画法线图** —— AI 直出的所谓「法线图」是一张假的紫蓝色画,
法线方向全是错的,接到 `normalMap` 上会让光照彻底乱掉。

台呢如果需要法线,直接从生成它的同一份噪声场算梯度即可(`three/textures.ts` 里数据都是现成的),
不需要任何外部工具。强度要压得很低 —— 台呢绒毛很浅,调大了球滚上去像在搓衣板上。

目前先不做:斜俯视 60° 的机位下,台呢的绒毛法线几乎看不出来。

---

## 六、Blender 模型(2 个)· ✅ 已完成

```
tools/blender/eight-ball/build_models.py
    ↓
blender -b --python tools/blender/eight-ball/build_models.py -- public/eight-ball/models
    ↓
public/eight-ball/models/{table,cue}.glb
```

只重建一个时把名字列在后面(`-- public/eight-ball/models cue`),免得另一个 glb 也被重导 ——
同样的输入两次导出的字节并不完全一致,全量跑会让 git 里多出无意义的二进制改动。

| 文件 | 内容 | 产出 |
| --- | --- | --- |
| `table.glb` | 库皮(六个袋口豁口)+ 木框台肩 + 裙板 + 六个网兜 + 四条台腿 | 40.9 KB / 840 tris |
| `cue.glb` | 皮头 + 接箍 + 前节 + 金属接头 + 后把 + 皮革握把 + 尾胶 | 21.3 KB / 420 tris |

**验收记录**:

| 项 | 值 | 对照 |
| --- | --- | --- |
| 世界单位 | 米,`WORLD_SCALE = 1.27/348` | — |
| 台面 PLAY | 1.2700 × 2.5400 m | 真实九尺台 ✓ |
| 球半径 | 0.0314 m | 真球 0.0286,`config.ts` 刻意放大 ✓ |
| 台体包围盒 | 1.8203 × 3.0903 × 0.8449 m | 与常量推算逐位一致 ✓ |
| 球杆 | 长 1.47 m,最粗直径 2.96 cm | 真实球杆 57–58 inch ✓ |

台呢面正好在 `y = 0`,引擎侧直接 add 到原点,不需要任何位移或旋转。

### 尺寸必须和物理对齐(唯一会翻车的地方)

`physics.ts` 认的是 2D 的 `PLAY` 边界、`POCKETS` 六个圆心、`POCKET_R = 15.5`。
台体如果和这套数字对不上,视觉上就会出现**球穿进库边里**,或者**离袋口还有一截就凭空消失**。

- **脚本不自己编尺寸**,从 `config.ts` 同一套常量换算。脚本头部集中声明,改了必须两边同步。
- **台呢平面归程序化**,Blender 只出库边以外的部分。「球能跑的区域」永远由代码定义,
  模型对不齐最多是边框错位,不会影响判定。
- **库边内壁是垂直的**,正好落在 `PLAY` 边界上。真台的库边截面是斜的(接触点在球心高度),
  这里刻意不做:斜面好看一点点,但只要角度和物理对不上,球就会看起来「陷进库里再弹出来」。

### 缺失时的回落

照 `neon-strike` 里 `prop-*.glb` 那条既有约定,**缺文件不报错、不影响开局**:

| 缺失 | 回落 |
| --- | --- |
| `table.glb` | 退回程序化的四条 `BoxGeometry` 库边 —— 难看但能打完整局 |
| `cue.glb` | 退回一根 `CylinderGeometry` |

### Blender 版本

脚本在 **Blender 5.2.0 LTS** 上验证通过。布尔求解器的枚举值各版本不一样
(4.x 是 `FAST`/`EXACT`,5.x 换成了 `FLOAT`/`EXACT`/`MANIFOLD`),脚本里是从 `bl_rna`
读当前版本认识的值再挑,没有写死 —— 别改回硬编码,否则换台机器就跑不起来。

---

## 七、清单速查

| 素材 | 出处 | 状态 |
| --- | --- | --- |
| 台呢贴图 | 程序化 `three/textures.ts` → `makeClothTexture()` | ☑ |
| 库边木贴图 | 程序化 `three/textures.ts` → `makeWoodTexture()` | ☑ |
| 地板贴图 | 程序化 `three/textures.ts` → `makeFloorTexture()` | ☑ |
| `textures/env.webp` | AI(2048×1024,58KB) | ☑ |
| `models/table.glb` | Blender(40.9KB) | ☑ |
| `models/cue.glb` | Blender(21.3KB) | ☑ |
| 球号贴图 ×16 | 程序化 Canvas 2D | ☑ `three/balls.ts` |
| 台呢法线图 | 从同一噪声场算梯度 | ☐ 暂不做,60° 机位下看不出来 |

素材侧到此齐了,总计 **120 KB**(env.webp 58 + table 41 + cue 21),其余全部零字节。
