# 深海捕鱼 —— 视听规格

配套 `DESIGN.md`。这一份只管「长什么样、听起来怎么样」，玩法数值一律以 DESIGN 为准。

---

## 0. 这一款为什么必须用真图

盒子里其它游戏的贴图都是 `Graphics.generateTexture()` 生成的，这一款是唯一的例外。原因只有一条：

**辨识度直接参与玩法决策。** 玩家要在半秒内判断「这条值不值得用 5 级炮打」，靠的是一眼认出鱼的种类。
色块画不出 8 种可区分的鱼——用 `Graphics` 画出来的鲨鱼和魔鬼鱼，在 1280 宽的池子里缩到 100px 就都是「一个带尾巴的椭圆」。

所以鱼走出图；背景、炮台和主要 UI 也已经按概念图补齐为真图。网、金币、气泡、光柱和粒子特效继续运行时生成。
`textures.ts` 里对应的色块是回退占位，接入时由 BootScene `load.image` 加载下表素材。

---

## 1. 出图前先守住的约定

这几条错了就得重出，写在最前面：

| 约定 | 值 | 为什么 |
| --- | --- | --- |
| 朝向 | **一律朝右**（鱼头在画面右侧） | `textures.ts` 的既有约定；朝左靠 `flipX`，两份图是浪费 |
| 视角 | 纯正侧视图，鱼身与画面平行 | 斜视图在水平游动时会显得在「拧着身子」 |
| 背景 | 纯品红 `#FF00FF`，无渐变无阴影 | 抠像用。和 `triple-pile` 那套一致 |
| 构图 | 整条鱼完整入画，四周留 ≥8% 空白 | 贴边会被抠像的 alpha bleed 啃掉鳍尖 |
| 光照 | 顶光 + 轻微上方冷色补光，不要投影 | 鱼池是俯视水体，投影会穿帮 |
| 高度上限 | 金龙 ≤200px、章鱼王 ≤260px（游戏内） | 鱼池净高只有约 580px，两条大鱼同屏就糊死了（DESIGN §7） |

**出图分辨率统一 1024×1024**，缩放到下表的目标尺寸这一步在后期做，不要让模型直接出小图。

---

## 1.5 已升级为 3D 模型

八张 PNG 现在是**模型的贴图**，不再直接进游戏：

```
public/fish-hunter/models/<kind>.glb   八条鱼,各带 1 秒循环的 swim 动画
public/fish-hunter/models/cannon.glb   炮台,turret 节点单独可转,accent 材质按座位染色
```

由 `tools/blender/fish-hunter/build_models.py` / `build_props.py` 无头生成，
`preview.py` 渲验收图。三个脚本都能 ssh 到装了 Blender 的机器上跑：

```
scp ... && blender -b --python build_models.py -- <源图目录> <输出目录>
```

**为什么不重新建模。** 相机是正对水面的正交相机，鱼永远以侧面朝向镜头——
看不到的细节建了也是白建。所以走低模 + 平面投影 UV（triple-pile 那套），
3D 化拿到的是**动作**，不是重做一遍美术。

**每种鱼一套自己的动作**，由四条通道组合：脊椎行波 / 上下浮沉 / 俯仰摇摆 / 呼吸缩放。
各通道频率刻意取不整除的比值，叠起来不会在同一拍对齐，循环感被打散。
参数表和每种鱼的动作意图写在 `build_models.py` 的 `FISH` 里。

三个踩过的坑（脚本注释里都有）：
- Blender 4.4+ 的 Action 改成了分层结构，`action.fcurves` 在 5.x 上已经没有了；
- 模型建在 Blender 的 **XZ** 平面（glTF 会把 Z-up 转成 Y-up），建在 XY 上导出后会平躺；
- `scene.frame_set` 是整个场景的，想在一张图里摆出多个姿态做不到。

下面这张表现在是**贴图规格**，同时也是模型的画面高度（`config.ts` 的 `height`）。

## 2. 八种鱼（已出图）

素材在 `public/fish-hunter/fish/<kind>.png`，尺寸与下表一致，全部 RGBA、紧裁、无品红残留。
**验收时量过四项**：alpha 通道、包围盒是否紧贴、品红残留像素数、主色相与声明值的偏差。

两处出图和声明不符，已经**改 `config.ts` 去迁就画面**（那个色只驱动飘字和描边，让它跟着画面走比重出图便宜）：

| kind | 声明 | 实际 | 色相差 | 处理 |
| --- | --- | --- | --- | --- |
| `turtle` | `#1dd1a1` 翡翠绿 | `#5cb04a` 叶绿 | 53° | config 改成 `0x5cb04a` |
| `ray` | `#a55eea` 紫 | `#8fc4e2` 灰蓝 | 66° | config 改成 `0x8fc4e2` |

`ray` 那条**没有按紫色出**，是一条写实灰白蝠鲼，而且边缘带一圈青色描边。
两个后果：一是它和 `shark`（`#8395a7`）的飘字颜色现在都偏灰蓝，区分度不如原设计；
二是青色正好是座位 0 的颜色（`#2ee6c8`），四人局里可能和网／炮台撞色。
不致命，想彻底解决就按 §3.3 的紫色提示词重出这一张。

### 原始规格

`色` 一列是 `config.ts` 里已经在用的主色，飘字和描边都取它——**出图要往这个色靠**，
否则捕获飘字的颜色和鱼身对不上，四个人同屏时就分不清谁抓了哪条。

| kind | 名字 | 面值 | 主色 | 游戏内高度 | PNG 输出（2 倍图） | 形体要点 |
| --- | --- | --- | --- | --- | --- | --- |
| `clown` | 小丑鱼 | 2 | `#ff9f43` 橙 | 44 | 176×132 | 最小最简单，扁圆身 + 三条白竖纹，一眼是「杂鱼」 |
| `blue` | 蓝鳍鱼 | 5 | `#54a0ff` 蓝 | 52 | 208×156 | 流线纺锤形，尾鳍分叉深，比小丑鱼修长 |
| `puffer` | 河豚 | 10 | `#feca57` 黄 | 60 | 240×180 | 正球形 + 短刺 + 小圆鳍，轮廓要圆到能和别的鱼区分 |
| `turtle` | 海龟 | 20 | `#1dd1a1` 绿 | 76 | 304×228 | 侧视，龟壳分块清晰，四肢舒展，慢吞吞的姿态 |
| `ray` | 魔鬼鱼 | 40 | `#a55eea` 紫 | 88 | 352×264 | 侧视展开的翼状胸鳍 + 细长尾，轮廓最「宽」 |
| `shark` | 鲨鱼 | 80 | `#8395a7` 灰 | 104 | 416×312 | 高背鳍 + 尖吻，灰白双色分明，攻击性剪影 |
| `dragon` | 金龙 | 200 | `#f9ca24` 金 | ≤200 | 800×400 | 长条龙身、鬃毛、龙须，通体鎏金带发光——**要一眼看出是大奖** |
| `boss` | 章鱼王 | 500 | `#ee5253` 红 | ≤260 | 1040×780 | 巨大头部 + 八条盘绕触手，占满画面，压迫感 |

**价值梯度必须做进画面里**，不能只靠数字：
体型递增、轮廓复杂度递增、金属/发光质感只给金龙和章鱼王。
玩家不看价格表也应该能排出「这条比那条值钱」。

---

## 3. 提示词

### 3.1 公共风格前缀（每条都拼在最前面）

```
2D game asset, single fish side view facing right, stylized painterly mobile game illustration,
clean bold silhouette, thick readable shapes, saturated color, soft top lighting with cool rim light,
no cast shadow, centered full body in frame, flat pure magenta #FF00FF background,
high detail but readable when scaled down to 100 pixels
```

### 3.2 公共负面提示词

```
text, letters, numbers, watermark, logo, signature, ui, frame, border,
multiple fish, school of fish, duplicated body, cropped fins, cut off tail,
front view, three quarter view, top down view, tilted body, diagonal composition,
photo, photorealistic, underwater scene, bubbles, seaweed, coral, sand, background scenery,
gradient background, drop shadow, reflection, glass tank, fishing net, hook, human, hand,
gore, blood, dead fish, low contrast, muddy colors, jpeg artifacts
```

### 3.3 逐条提示词

**clown（小丑鱼 · 2）**
```
a small cartoon clownfish, plump oval body, bright orange #ff9f43 body with three crisp white vertical
bands outlined in black, small rounded fins, cheerful simple shape, the cheapest common fish in the pond
```

**blue（蓝鳍鱼 · 5）**
```
a small streamlined tuna-like fish, sleek spindle body, vivid azure blue #54a0ff back fading to pale silver
belly, deeply forked tail fin, sharp small pectoral fins, quick and agile look
```

**puffer（河豚 · 10）**
```
a fully inflated pufferfish, perfectly spherical body, warm yellow #feca57 skin with soft cream belly,
short blunt spines all over, tiny round pectoral fins, big round eyes, comically round silhouette
```

**turtle（海龟 · 20）**
```
a sea turtle swimming, side view, domed shell with clearly separated hexagonal scute plates in jade green
#1dd1a1, olive skin, four broad outstretched flippers, calm gentle expression, slow and heavy posture
```

**ray（魔鬼鱼 · 40）**
```
a manta ray gliding, side view showing one broad wing-like pectoral fin fully spread, long slender whip tail,
deep violet purple #a55eea top surface with pale underside, elegant flowing silhouette, widest shape in the set
```

**shark（鲨鱼 · 80）**
```
a predatory shark, side view, muscular torpedo body, tall pointed dorsal fin, crescent tail, pointed snout,
steel grey #8395a7 back with sharp white belly line, visible gill slits, menacing aggressive silhouette
```

**dragon（金龙 · 200）**
```
a majestic golden chinese dragon fish, long serpentine body with large overlapping golden #f9ca24 scales,
flowing mane and two long whiskers, ornate flared fins, subtle inner glow and warm rim light,
legendary treasure creature, clearly the rarest and most valuable fish in the set
```

**boss（章鱼王 · 500）**
```
a giant king octopus boss, huge bulbous head filling the frame, eight thick curling tentacles with visible
suckers arranged around the body, deep crimson red #ee5253 skin with darker mottling, glowing amber eyes,
crown-like ridge on the head, imposing boss monster presence
```

---

## 4. 出图之后的后期

模型出的是 1024×1024 品红底，进游戏前要做四步（和 `triple-pile` 那套抠像流程同源）：

1. **抠像**：把 `#FF00FF` 附近的像素（HSV 容差，色相 ±12°）打成透明。
2. **alpha bleed**：把边缘半透明像素的 RGB 用邻近不透明像素填一遍。
   **这一步不能省** —— 不做的话缩放时边缘会渗出一圈品红，鱼身上镶一道粉边，
   而且只在缩小时才看得见，验收时容易漏。
3. **裁剪**：按 alpha 包围盒紧裁，四周各留 2px。紧裁之后判定圈才和贴图对得上。
4. **缩放**：Lanczos 缩到 §2 表里的「PNG 输出」尺寸，存 `public/fish-hunter/fish/<kind>.png`。

命名必须是 `<kind>.png`（`clown.png`、`blue.png`…），和 `config.ts` 的 `FishKindId` 一一对应。

**改了这批图记得把 `public/sw.js` 的 `VERSION` 加一档**，否则装过 PWA 的人拿到的还是旧缓存。

---

## 5. 场景与 UI 素材（已出图）

统一视觉：深海军蓝底、银色枪灰金属结构、青色能量描边。除背景外全部为紧裁 RGBA PNG，
已经完成品红抠像、alpha bleed 和 Lanczos 缩放。按钮和面板里的文字由代码绘制，不烘焙进图片，
以便复用、动态更新和多语言适配。

| 文件 | 输出尺寸 | 用途与接入约定 |
| --- | ---: | --- |
| `public/fish-hunter/background.png` | 1280×800 | 主游戏深海背景；中央低干扰，顶部水面和五束光柱已烘焙 |
| `public/fish-hunter/ui/cannon-base.png` | 296×240 | 通用炮台底座；炮管转动时底座保持固定 |
| `public/fish-hunter/ui/cannon-barrel.png` | 120×320 | 独立炮管；旋转原点放在底部圆形轴心 |
| `public/fish-hunter/ui/hud-player.png` | 512×132 | 玩家信息条；左右圆槽和中间区域由代码叠头像、金币、倍率等内容 |
| `public/fish-hunter/ui/button-minus.png` | 128×123 | 降低炮倍按钮，图片已带减号 |
| `public/fish-hunter/ui/button-plus.png` | 127×128 | 提高炮倍按钮，图片已带加号 |
| `public/fish-hunter/ui/alert-dragon.png` | 768×277 | 金龙进场事件条；右侧空白区叠动态文案 |
| `public/fish-hunter/ui/alert-boss.png` | 768×292 | 章鱼王进场事件条；右侧空白区叠动态文案 |
| `public/fish-hunter/ui/modal-panel.png` | 960×474 | 通用弹窗底板；暂停、提示、设置、结算共用，内容由代码叠加 |
| `public/fish-hunter/ui/button-back.png` | 150×160 | 左上角返回按钮，图片已带左箭头 |
| `public/fish-hunter/ui/button-online-lobby.png` | 640×170 | 联机大厅主按钮；左侧网络图标，中央叠“联机大厅”及状态文字 |

原始生成图暂存在 `tmp/fish-hunter-ui/`（该目录不进仓库）；可提交、可运行时加载的成品只认
`public/fish-hunter/`。统一后期脚本是：

```bash
python3 tools/art/fish-hunter/process_ui.py tmp/fish-hunter-ui public/fish-hunter/ui
```

### 继续运行时生成的素材

| 元素 | 做法 |
| --- | --- |
| 网 | 三层同心圆 + 米字线，白色贴图 `setTint` 成座位色 |
| 炮弹 | 小圆弹丸 + 外圈光晕，同样 `setTint` |
| 金币 | 双层圆 |
| 气泡 / 动态光 | 在背景图上追加轻量 tween，避免静态画面 |
| 特效 | `vfx.ts`，见下表。贴图一律画成白的，用 `setTint` 上色——一张 `spark` 同时当水花、金光、警示用 |

### 特效清单（`vfx.ts`）

| 时机 | 效果 | 为什么需要 |
| --- | --- | --- |
| 开炮 | 炮口加色光斑 + 炮管回缩 | 按下的那一帧就要有反馈，不能等网飞出去 |
| 网炸开 | 涟漪环（在鱼**下面**）+ 7 滴四散水花 | 「网撒到水里」而不是「爆炸」 |
| **罩住了没捞中** | 鱼闪白 + 抖两下 | **最重要的一个**。缺了它，玩家分不清「网空放」和「罩住了没摇中」，而后者是这游戏的核心体验——捕获概率本来就是 K/面值，大鱼很难捞。没有这个反馈，低概率会被误读成「我瞄不准」 |
| 捕获 | 光爆 + 冲击环 +（自己的才有）星芒迸射 | 别人的捕获只给小闪，画面不能被别人的收益抢走 |
| 金龙 / 章鱼王进场 | 全屏斜扫光 + 上下压暗边 | 这是全局仅有的两个「事件」，不播报的话玩家会整条错过 |
| 背景 | 7 片缓慢游动的焦散光纹 | 没有它，一池子鱼看着像贴在玻璃上 |

**特效不做任何判定。** 罩住谁、捞中谁一律以服务端消息为准（DESIGN §3.1）；
`struggleUnderNet` 用的判定圈虽然和服务端同一个公式，但结果只用来抖动画。
一旦特效开始决定「这条鱼死没死」，客户端就多了一份影子权威，迟早和服务端对不上。

**座位色是可读性红线**（DESIGN §7）：四个人的网同时在场时，网、炮台、飘字必须能立刻对上人。

| 座位 | 色 |
| --- | --- |
| 0 | `#2ee6c8` 青 |
| 1 | `#ff9f43` 橙 |
| 2 | `#a55eea` 紫 |
| 3 | `#7bed9f` 绿 |

捕获飘字：**自己的用 30px 不透明，别人的用 18px 半透明**。四个人同时捞时，画面上只有自己的收益该抢眼。

---

## 6. 音效

**已出。** 由 `tools/audio/fish-hunter/build_sfx.mjs` 生成(rFXGen,和霓虹突击同一套流程):
写 `.rfx` 参数文件 → 调 rFXGen 渲染每一层 → 混层 + 峰值归一 + 首尾 2ms 淡入淡出 → `public/fish-hunter/audio/*.wav`。

```
node tools/audio/fish-hunter/build_sfx.mjs --ssh mac@192.168.64.1
```

想手调音色:用 rFXGen GUI 打开 `tools/audio/fish-hunter/presets/*.rfx`,拖参数,存回原文件,再跑一遍脚本。

| 名字 | 时长 | 峰值 | 层 | 音色意图 |
| --- | --- | --- | --- | --- |
| `fire` | 0.11s | 0.42 | 方波下扫 + sub | 短促气压推送。**必须短** —— 220ms 一发,尾巴长一点就糊成一片 |
| `pop` | 0.28s | 0.55 | 低通噪声 + sub | 网入水的闷响,不是爆炸。高频留多了会变成"打铁" |
| `catch` | 0.26s | 0.62 | 两声上行正弦 + 方波点 | 「叮-咚」的入账感 |
| `jackpot` | 0.58s | 0.80 | 四段上行琶音 + 铺底 | 和 `catch` 的差别是**长度**:那个是一个点,这个是一句话 |
| `coin` | 0.08s | 0.30 | 高频正弦上滑 | 一次捕获最多飞 6 枚、间隔 40ms,又短又轻才不会叠成嗡嗡声 |
| `deny` | 0.24s | 0.45 | 低锯齿下沉 | 余额不足。**不做惩罚感** —— 这游戏不卖金币,没钱只是个提示 |

响度关系是刻意排的:`coin < fire < deny < pop < catch < jackpot`。
`fire` 和 `coin` 会被高频重复触发,峰值必须压住,否则连打二十秒就只剩噪音。
**归一化在生成时做完了,运行时不要再逐个调音量** —— 两个地方调音量最后一定对不上。

### 踩过的坑:rFXGen 的包络参数不是秒

attack / sustain / decay 的实际时长是

```
t = 参数² × 100000 采样 ÷ 44100 ≈ 参数² × 2.27 秒
```

**平方关系**。第一版按"秒"填,出来的 `fire` 是 30ms、`coin` 是 10ms —— 短到听着像爆音而不是音效。
查表:`0.10→23ms  0.14→44ms  0.20→91ms  0.26→153ms  0.30→204ms  0.40→363ms`。

另一条(继承自霓虹突击那份脚本):**要往下扫频时 `deltaSlide` 必须 ≤ `slide`**,
否则 rFXGen 生成时会把 slide 顶成 deltaSlide,下扫被抹平成 0。脚本里有断言挡着。

改了 wav 或图片记得把 `public/sw.js` 的 `VERSION` 加一档（本批场景/UI 素材完成后为 v9），否则装过 PWA 的人拿到的是旧缓存。
