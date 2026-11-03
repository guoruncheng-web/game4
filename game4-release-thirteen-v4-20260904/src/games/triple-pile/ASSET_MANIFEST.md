# 叠叠消（Triple Pile）素材清单

## 场景

- `scene/tabletop.png`：竖屏浅木桌背景，不含交互物体
- `scene/tabletop-with-tray.png`：浅木桌与七格槽合成背景，可在透明槽素材完成前直接使用
- `scene/hotpot.png`：俯视黄铜双耳火锅，透明背景
- `scene/plate-meat.png`：肥牛盘边缘装饰
- `scene/plate-tofu.png`：豆腐盘边缘装饰
- `scene/plate-greens.png`：青菜盘边缘装饰
- `scene/bowl-sauce.png`：蘸料碗边缘装饰

## 可交互食材

- `ingredients/napa-cabbage.png`：娃娃菜
- `ingredients/lettuce.png`：生菜
- `ingredients/corn.png`：玉米段
- `ingredients/shiitake.png`：花刀香菇
- `ingredients/tofu.png`：豆腐块
- `ingredients/fish-ball.png`：鱼丸
- `ingredients/crab-stick.png`：蟹棒
- `ingredients/lotus-root.png`：藕片
- `ingredients/dumpling.png`：饺子
- `ingredients/tofu-skin-roll.png`：响铃卷
- `ingredients/sausage.png`：小香肠
- `ingredients/beef-roll.png`：肥牛卷

所有食材均为独立透明 PNG，统一正俯视、右上主光、左下柔和阴影。运行时允许绕屏幕法线旋转和缩放，但不混用其他视角素材。

## UI

- `ui/slot-tray.png`：七格收集槽（透明成品待去底）
- `source/slot-tray-chroma.png`：七格收集槽洋红底源图
- `ui/timer-panel.png`：倒计时底板
- `ui/button-pause.png`：暂停按钮
- `ui/button-audio.png`：声音按钮
- `ui/booster-remove.png`：移出
- `ui/booster-match.png`：凑齐
- `ui/booster-shuffle.png`：打乱
- `ui/plus-badge.png`：道具补充角标

文字与数字由 HTML/CSS 或 Canvas 实时绘制，素材图内不烘焙文字，便于适配与本地化。

## 音效

成品位于 `public/triple-pile/assets/audio/`，统一为 44.1kHz、16-bit、单声道 WAV；
可编辑的 rFXGen 原生预设与构建器位于 `tools/audio/triple-pile/`。

- `pick.wav` / `slot.wav`：拾取与入槽
- `clear.wav` / `tumble.wav`：三消与锅内塌落
- `warn.wav`：槽位告急
- `countdown-tick.wav` / `countdown-final.wav`：倒计时与归零
- `ui-click.wav` / `ui-back.wav`：通用按钮与返回
- `ui-pause.wav` / `ui-resume.wav`：暂停与继续
- `toast.wav` / `invalid.wav`：提示条与无效操作
- `power-takeout.wav` / `power-complete.wav` / `power-shuffle.wav`：三种道具
- `win.wav` / `fail.wav`：通关与失败
