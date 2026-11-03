# 游戏特效生成提示词

适用于 ComfyUI 图像或短视频工作流。提示词使用英文以提高模型理解稳定性；所有素材均要求原创，不复刻现有商业游戏的标志性特效。

## 通用输出规范

- 先生成单个效果的 `1024×1024` 母版，再裁切、缩放为游戏尺寸。
- 动画优先生成 `4×4 sprite sheet, 16 frames, left to right, top to bottom`。
- 每格主体必须居中、尺寸一致、相机固定，首尾不得互相串帧。
- 默认黑色纯背景，后处理使用亮度键或分割节点去背；模型确实支持透明通道时才改为透明背景。
- 禁止文字、数字、UI、边框、水印、飞船、水果、人物和完整场景进入特效素材。
- 循环特效首尾动作与亮度需要衔接；一次性特效最后一帧完全消散。

通用负面提示词：

```text
text, letters, numbers, logo, watermark, user interface, border, frame lines, grid labels, character, person, hands, weapon, spaceship, aircraft, fruit, background scenery, horizon, camera movement, motion blur across frame boundaries, cropped effect, duplicated effect, multiple unrelated effects, dirty gray background, compression artifacts, low contrast, photorealistic debris, gore
```

## 霓虹突击 Neon Strike

统一风格追加词：

```text
premium realistic science-fiction game VFX, deep-space technology, crisp luminous energy, cyan and ice-blue player palette, orange-red enemy danger palette, bright white energy core, controlled bloom, high contrast, clean silhouette, readable at mobile-game size, centered isolated effect on pure black background
```

### 1. 玩家等离子子弹

```text
A single narrow cyan plasma bolt flying vertically upward, needle-shaped bright white core, compact electric-blue halo, two short tapering energy trails, precise military spacecraft weapon, no muzzle and no impact, premium realistic science-fiction game VFX, clean centered isolated asset on pure black background
```

建议：静态图，`256×512`；游戏内约 `10×28 px`。

### 2. 玩家激光命中

```text
4x4 sprite sheet, 16 sequential frames, a cyan plasma projectile impact animation, tiny white-hot contact flash expands into a sharp circular electric-blue shock ring, six short radial sparks, then rapidly contracts and fully disappears, fixed camera, identical centered position and scale in every cell, premium realistic sci-fi game VFX on pure black background
```

建议：一次性动画，`280–360 ms`，游戏内 `64–96 px`。

### 3. 战机推进器尾焰

```text
4x4 sprite sheet, 16 sequential frames, seamless looping twin spacecraft engine exhaust flames pointing straight downward, compact white-hot nozzles, cyan plasma core fading to transparent deep blue, subtle turbulent flicker, stable length and fixed anchor point, no spacecraft body, premium realistic sci-fi VFX on pure black background
```

建议：循环动画，`12–16 fps`，游戏内高 `60–90 px`。

### 4. 敌机受击火花

```text
4x4 sprite sheet, 16 sequential frames, compact orange-red armor hit sparks, one sharp warm-white flash, five metallic sparks and two tiny glowing fragments spreading outward, fast decay with no smoke cloud, fixed centered position, readable mobile game VFX on pure black background
```

建议：一次性动画，`180–260 ms`，游戏内 `48–72 px`。

### 5. 敌机爆炸

```text
4x4 sprite sheet, 16 sequential frames, an enemy drone explosion, bright white-orange ignition core, expanding orange fire petals, red circular pressure wave, a few dark angular metal fragments, compact dark smoke that dissolves completely by the final frame, energetic but clean arcade readability, fixed camera, centered on pure black background
```

建议：一次性动画，`500–650 ms`，游戏内 `110–150 px`。

### 6. Boss 大型爆炸

```text
4x4 sprite sheet, 16 sequential frames, massive carrier spacecraft destruction VFX with three chained white-hot orange detonations merging into one broad red-orange shockwave, glowing cyan reactor fragments, sparse dark armor debris and expanding smoke, spectacular controlled bloom, final frame fully dissipated, no spacecraft body, centered on pure black background
```

建议：可生成三套不同种子叠加播放，单套 `700–900 ms`，游戏内 `220–320 px`。

### 7. 护盾常驻波纹

```text
4x4 sprite sheet, 16 sequential frames, seamless looping transparent spherical energy shield surface, thin cyan circular rim, subtle hexagonal field cells, gentle clockwise energy flow, very faint center so the spacecraft remains visible, fixed size and center, no solid orb, premium sci-fi HUD-free VFX on pure black background
```

建议：循环动画，低透明度，游戏内 `120–150 px`。

### 8. 护盾受击

```text
4x4 sprite sheet, 16 sequential frames, localized impact on a cyan spherical energy shield, white contact point blooms into curved electric arcs and a brief hexagonal ripple across one side of the shield, rapidly fades back to nothing, no projectile and no ship, fixed center, isolated on pure black background
```

建议：一次性动画，`300–420 ms`，允许按受击方向旋转。

### 9. Boss 登场能量场

```text
4x4 sprite sheet, 16 sequential frames, ominous red-orange hyperspace arrival portal, thin circular energy ring forms from sparks, compresses inward, then bursts into a wide radial distortion wave and fades, dark red ion particles, clean center reserved for a boss ship, fixed camera, isolated on pure black background
```

建议：一次性动画，`900–1200 ms`，游戏内 `300–420 px`。

### 10. 能量道具拾取

```text
4x4 sprite sheet, 16 sequential frames, bright green energy pickup burst, compact white-green star core, two clean circular rings expanding upward, six soft particles spiraling inward and disappearing, positive high-tech feedback, fixed centered position, isolated game VFX on pure black background
```

建议：一次性动画，`350–500 ms`，游戏内 `80–110 px`。

## 水果切切乐 Fruit Slasher

统一风格追加词：

```text
polished stylized mobile game VFX, joyful juicy shapes, hand-painted 2.5D illustration, bold clean silhouette, soft left-top highlight, saturated color, moonlit bamboo dojo palette, readable at small size, centered isolated effect on pure black background, family-friendly, no gore
```

### 1. 青蓝刀光

```text
4x4 sprite sheet, 16 sequential frames, a fast diagonal sword slash made only of light, brilliant white curved core with cyan outer glow, starts as a tiny spark, sweeps into one elegant tapered crescent, breaks into two star glints and fully disappears, no sword and no hand, fixed camera, isolated on pure black background
```

建议：一次性动画，`140–220 ms`；生成横、竖、左右斜向四个版本，或运行时旋转。

### 2. 通用果汁飞溅

```text
4x4 sprite sheet, 16 sequential frames, stylized fresh fruit juice splash animation, a compact central splash expands into eight rounded liquid droplets and two curved splash ribbons, playful elastic motion, glossy highlights, droplets shrink and disappear by the final frame, no fruit pieces, no container, isolated on pure black background
```

建议：分别换色生成红、橙、绿三套，`320–480 ms`，游戏内 `90–140 px`。

### 3. 西瓜切开爆汁

```text
4x4 sprite sheet, 16 sequential frames, vivid watermelon-red juice burst with a pale rind-green accent ring, rounded droplets fan outward along a diagonal cut, a few tiny black seed silhouettes, juicy glossy cartoon timing, no whole fruit and no fruit halves, final frame fully clear, isolated on pure black background
```

### 4. 柑橘切开喷雾

```text
4x4 sprite sheet, 16 sequential frames, bright orange citrus spray, fine sparkling mist mixed with six round juice droplets, a brief translucent orange radial ring like squeezed citrus, fresh energetic motion, no whole orange and no slices, final frame fully dissipated, isolated on pure black background
```

### 5. Combo 金色爆发

```text
4x4 sprite sheet, 16 sequential frames, celebratory golden combo burst, warm-white center flash, one hand-painted gold circular brush ring, eight small diamond star glints and short paper-like spark streaks, energetic but leaving the center clear for score text, no letters or numbers, isolated on pure black background
```

建议：一次性动画，`420–600 ms`，游戏内 `170–230 px`。

### 6. Critical 完美切割

```text
4x4 sprite sheet, 16 sequential frames, precision critical-hit VFX, razor-thin warm-white slash crosses a compact orange sunburst, followed by a perfect golden ring and four symmetric star points, sharp confident timing, no text, no weapon, final frame disappears, isolated on pure black background
```

建议：一次性动画，`260–380 ms`，比普通刀光更短、更亮。

### 7. 炸弹引线火星

```text
4x4 sprite sheet, 16 sequential frames, seamless looping tiny bomb fuse sparks, two to four warm-yellow and orange sparks popping upward with a small ember glow, irregular playful rhythm, compact footprint, no bomb body, no smoke cloud, isolated on pure black background
```

建议：循环动画，`10–14 fps`，游戏内 `28–42 px`。

### 8. 炸弹爆炸

```text
4x4 sprite sheet, 16 sequential frames, family-friendly stylized bomb explosion, one-frame warm-white core, bold orange-red expanding impact ring, eight dark rounded fragments, compact charcoal smoke puffs with red ember edges, strong readable silhouette without realistic fire or violence, final frame fades clear, isolated on pure black background
```

建议：一次性动画，`480–650 ms`，游戏内 `210–280 px`；全屏闪白由代码单独完成。

### 9. 失误反馈

```text
4x4 sprite sheet, 16 sequential frames, subtle missed-fruit feedback, a cool gray-blue circular ripple drops downward and breaks into three fading droplets, gentle disappointed motion, low brightness, no fruit, no symbol, no text, isolated on pure black background
```

建议：一次性动画，`300–450 ms`，不能抢过炸弹和 Combo 的视觉层级。

### 10. 新纪录庆祝

```text
4x4 sprite sheet, 16 sequential frames, elegant new-record celebration burst inspired by a moonlit bamboo dojo, warm gold star glints, small red and cream paper confetti, one soft circular lantern-light halo, upward joyful motion, center kept empty for score, no text, no logo, isolated on pure black background
```

建议：一次性动画，`800–1100 ms`，游戏内覆盖结算卡片上半部。

## 生成后的验收标准

- 缩放到游戏实际尺寸后，轮廓仍能在 `100 ms` 内被识别。
- 黑底去除后没有灰边、黑边或大范围半透明雾幕。
- 序列帧中效果中心漂移不超过母版单格宽度的 `2%`。
- 一次性效果最后一帧 Alpha 基本归零；循环效果首尾亮度差异不明显。
- 太空射击中玩家与敌方颜色不可混淆；水果游戏中炸弹爆炸不可像果汁奖励。
- 同屏叠加三次仍不遮挡主要目标和碰撞判断。
