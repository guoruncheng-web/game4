# Ludo 美术与素材规格

## 1. 视觉基准

- 手机竖屏、深蓝星空与软云层背景，UI 使用高亮描边、圆角玻璃面板和糖果塑料质感。
- 主色：深蓝 `#071D63`、亮蓝 `#087CFF`、青色 `#20D9E8`、紫色 `#9A55F5`。
- 功能色：离开用暖黄、准备用紫、开始用绿、加入与发送用青色、禁用用灰蓝。
- **四家阵营色固定为红 / 黄 / 蓝 / 绿**，和 `sim/board.ts` 的 `COLORS` 一一对应。
  青色是 UI 强调色（加入、复制、发送），**不是阵营色** —— 两者混用会让玩家把按钮当成某一家的东西。
- 棋盘必须保持俯视、对称、高辨识度。

概念图基准位于 `src/games/ludo/image/`，和 DESIGN.md §2 的五个页面一一对应：

| 流程 | 概念图 |
| --- | --- |
| ① 加载页 | `loading-concept-v1.png` |
| ② 游戏大厅 | `room-entry-concept-v4.png`（Logo、双主按钮、聊天历史 / 输入 / 发送完整布局） |
| ② 创建房间弹窗 | `create-game-success-concept-v3.png`（覆盖在 v4 大厅之上） |
| ② 加入房间弹窗 | `join-existing-game-concept-v3.png`（覆盖在 v4 大厅之上） |
| ③ 游戏房间（房主视角） | `pre-game-host-concept-v2.png` |
| ④ 开局动画 | `game-start-animation-concept-v2.png` |
| ⑤ 对局 | `gameplay-concept-v2.png` |

## 2. 运行时素材清单

运行时图片统一放在 `public/ludo/`。下表同时是素材用途记录，生成一张就更新一行。

界面拆分源文件 `ui/logo.png` 是从大厅视觉基准单独生成并去背的透明 Logo，包含彩色 `LUDO` 与“游戏大厅”副标题；运行时副本为 `public/ludo/ui/lobby-logo.png`，用于大厅与房间页中央主视觉。

| 文件 | 用途 | 接入位置 | 状态 |
| --- | --- | --- | --- |
| `backgrounds/lobby-sky.png` | 加载、大厅、房间和开局动画共用的竖屏星空云层背景 | 页面最底层背景 | 已生成候选 |
| `ui/game-logo.png` | 加载页、大厅和房间中央的 Logo | 主视觉 | 已生成候选 |
| `ui/game-start-table-dynamic-v1.png` | 不含中央骰子的开局牌桌底图，使用新文件名避开旧图缓存；四个透明圆孔填入真实头像，合成画面切成四块加速飞入拼合 | 开局动画 | 已生成 |
| `effekseer/vs/vs-burst-v1806.efkefc` | 拼图开始 120ms 即汇聚粒子，四块落位时在 580ms 爆点喷出 30 枚金白/冰蓝火花并显出 `VS`；1.8s 开始整体淡出、2.1s 完全消失，定位对齐牌桌视觉中心 `top:44%` | 开局动画中心特效 | 已接入 |
| `ui/lobby-logo.png` | 彩色 `LUDO` 与“游戏大厅”独立透明 Logo | 大厅与房间页中央主视觉 | 已接入 |
| `ui/gameplay-logo-v1.png` | 对局设计稿同款红黄蓝绿 `LUDO` 翼形透明字标 | 对局页顶部中央 | 已生成并接入（内置 imagegen） |
| `image/gameplay-competitor-inspired-concept-v1.png` | 第一轮“玩家信息并入基地”的探索稿；仍保留旧 Logo 与外置骰子，和竞品骨架差距过大 | 废弃探索，仅保留迭代记录 | 已生成，已否决 |
| `image/gameplay-competitor-layout-concept-v2.png` | 严格参考竞品信息骨架重新设计：房间头、人数、状态行、基地内玩家/骰子、棋盘下消息与聊天 | Three.js 对局重构正式视觉基准 | 已生成并用于重构（内置 imagegen） |
| `ui/dialog-panel.png` | 创建、加入、错误提示等统一弹窗底板 | 所有 DOM 弹窗 | 已生成候选 |
| `ui/button-purple.png` | 创建房间、准备 | 主按钮背景 | 已生成候选 |
| `ui/button-cyan.png` | 加入房间、复制、发送 | 主按钮背景 | 已生成候选 |
| `ui/button-yellow.png` | 离开 | 主按钮背景 | 已生成候选 |
| `ui/button-green.png` | 开始游戏 | 主按钮背景 | 已生成候选 |
| `ui/button-disabled.png` | 不满足开始条件等禁用状态 | 主按钮背景 | 已生成候选 |
| `ui/icons/*.png` | 创建、加入、复制、关闭、时长、玩家、皇冠、准备、设置、加座、机器人、发送 | 按钮和状态图标 | 已生成候选（12 枚） |
| `ui/icons/coin-gameplay-v1.png` | 对局玩家卡内的金币/分数标记，替换 CSS 圆点占位 | 对局 HUD 四张玩家卡 | 已生成并接入（内置 imagegen） |
| `ui/icons/chat-gameplay-v1.png` | 对局底部聊天输入入口，替换 `•••` 文字占位 | 对局 HUD 聊天栏左侧 | 已生成并接入（内置 imagegen） |
| `ui/icons/mute-gameplay-v1.png` | 竞品骨架重构后的语音静音状态图标 | 对局 HUD 聊天栏左侧 | 已生成并接入（内置 imagegen） |
| `avatars/player-01-square-v2.png`…`player-06-square-v2.png` | 统一 512×512、脸部居中、无自带圆环的真人默认透明头像；版本化文件名隔离旧头像缓存 | 大厅、房间、聊天、棋盘角标 | 已生成并接入（imagegen 编辑 + 品红色键去背，6 枚；旧竖版备份在 `public/ludo/raw/avatars-portrait/`） |
| `avatars/bot-square-v2.png` | 统一 512×512、主体居中、无自带圆环的机器人透明头像；版本化文件名隔离旧头像缓存 | 房间与棋盘 | 已生成并接入（imagegen 编辑 + 品红色键去背；旧竖版已备份） |

头像显示规范：运行时头像容器使用正方形圆角卡片（成员位 `rounded-xl`、聊天 `rounded-md`），禁止再次套 `rounded-full` 圆形裁罩；开局图的四色圆环属于场景装饰，头像素材本身仍保持无环正方形。
| `board/board.png` | 标准四色 Ludo 棋盘底图，不含棋子和头像 | Three.js 棋盘平面纹理 | 已生成候选 |
| `board/board-gameplay-v2.png` | 对局概念图与材质参考；基地孔未严格落在逻辑格心，禁止直接作为运行时棋盘纹理 | 美术参考，不接入棋盘 Mesh | 已生成，已从运行时移除 |
| `models/pawn.glb` | 可由 `accent` 材质换成红 / 黄 / 蓝 / 绿的圆润棋子 | Three.js 棋子实例 | 已生成（83KB） |
| `models/dice.glb` | 完整标准六面圆角骰子，点数关系为 1↔6、2↔5、3↔4；VS 爆点后间隔 1 秒掉落，持续旋转 3 秒后定格为 6 | 开局动画与 Three.js 掷骰动画 | 已生成 |
| `models/dice-complete-v2.glb` | 完整六面骰子的开局动画缓存隔离副本，避免客户端继续命中旧三面模型 | 开局骰子动画 | 已生成 |
| `audio/dice-roll.wav` | 骰子滚动 | 掷骰动画 | 已生成（rFXGen） |
| `audio/piece-step.wav` | 棋子落格 | 每步移动 | 已生成（rFXGen） |
| `audio/piece-capture.wav` | 撞回对手棋子 | 撞击反馈 | 已生成（rFXGen） |
| `audio/home-lane.wav` | 进入终点道 | 路线阶段提示 | 已生成（rFXGen） |
| `audio/piece-home.wav` | 棋子到家 | 单棋完成反馈 | 已生成（rFXGen） |
| `audio/victory.wav` | 对局胜利 | 名次结算 | 已生成（rFXGen） |
| `audio/room-join.wav` | 玩家进入房间 | 房间社交提示 | 已生成（rFXGen） |
| `audio/intro-piece-sweep.wav` | 四块拼图高速飞入的空气掠过层 | 开局动画 0ms | 已生成（rFXGen） |
| `audio/intro-vs-sub.wav` / `intro-vs-crack.wav` / `intro-vs-spark.wav` | VS 爆炸的低频、裂响和高频闪光三层 | 开局动画 580ms | 已生成（rFXGen） |
| `audio/intro-dice-fall.wav` / `intro-dice-spin.wav` | 骰子下坠风切与 3 秒翻滚颗粒声 | 开局动画 1580ms 起 | 已生成（rFXGen） |
| `audio/intro-dice-land-body.wav` / `intro-dice-land-click.wav` | 骰子首次触桌的低频主体和塑料脆响 | 开局动画 2100ms | 已生成（rFXGen） |
| `audio/intro-dice-six.wav` | 骰子六点锁定的明亮双音确认 | 开局动画 4580ms | 已生成（rFXGen） |

## 3. 生成和接入约定

- 生成方式：内置 `imagegen`；需要透明背景的简单不透明物件先生成纯品红键色源图，再本地去背。
- 透明 PNG 必须检查 alpha、透明四角、主体覆盖率和品红残边。
- 按钮图不包含文字，允许 DOM 在上层复用同一按钮图显示不同文案。
- 图标不包含外圈按钮底板，便于在成员位、聊天、弹窗等不同尺寸复用。
- 棋盘底图不包含棋子、头像、分数和文字；这些全部由运行时绘制。
- 3D 棋子与骰子不使用位图冒充，由 `tools/blender/ludo/build_models.py` 无头生成 GLB；棋子运行时只替换 `accent` 材质颜色。
- 音效由 `tools/audio/ludo/build_sfx.mjs` 写出 `presets/*.rfx` 后调用 rFXGen 无 GUI 渲染；单颗骰子滚动由一次主体和多次变调触点实时编排，避免连续素材产生骰盅听感。
- 撞击星芒、落格光圈和到家彩带使用 Three.js 程序化粒子，不另存序列帧位图，避免把阵营色烘焙进素材。

## 2.1 暂缓素材

以下素材已确认需要，但本轮暂不生成；当前项目中没有对应成品文件：

| 计划文件 | 用途 | 建议生成方式 | 状态 |
| --- | --- | --- | --- |
| `audio/error-disconnect.wav` | 操作失败、加入失败和联机断开提示 | rFXGen，低沉双脉冲，避免刺耳蜂鸣 | 待生成 |
| `audio/countdown-warning.wav` | 回合或对局最后 3 秒逐秒提示 | rFXGen，短促清晰脉冲，由运行时连续播放三次 | 待生成 |
| `audio/result-neutral.wav` | 平局或非第一名结算提示 | rFXGen，中性下降音，不使用失败嘲讽感 | 待生成 |
| `ui/icons/music-on.png` | 背景音乐开启状态 | 内置 imagegen，匹配现有白色与蓝色高光 3D 图标 | 待生成 |
| `ui/icons/music-off.png` | 背景音乐关闭状态 | 内置 imagegen，与 `music-on.png` 共用轮廓和视角 | 待生成 |
| `audio/lobby-bgm.ogg` | 大厅循环背景音乐 | Stable Audio，无歌词、轻松棋盘社交氛围、可循环 | 待生成 |
| `audio/gameplay-bgm.ogg` | 对局循环背景音乐 | Stable Audio，无歌词、轻快但不干扰掷骰和落子反馈、可循环 | 待生成 |

Stable Audio 候选仅用于开发验证；商业发布前必须确认对应模型与生成服务的商业授权，或替换为具有明确商业许可的音乐来源。

## 4. 棋盘底图的硬性约束

**这一节的每一条都对应 `sim/board.ts` 里的一个常量，出图前必须对齐，画错了要重出：**

| 约束 | 值 | 出处 |
| --- | --- | --- |
| 外圈格数 | **56**（四臂各 14 格），15×15 网格 | `TRACK` / `layout.RING` |
| 终点道 | 每家 **6 格** | `HOME_LEN` |
| 基地 | 每家 **4 颗**棋子的停放位 | `PIECES_PER_SEAT` |
| 入场格 | 四个，画成各家颜色，带前进方向箭头 | `ENTRY` |
| ★ 安全格 | **四个**，在各自入场格往前第 8 格 | `SAFE` |

**棋盘上没有捷径。** 不要画斜穿棋盘的虚线飞行道，也不要在外圈散布彩色跳跃格 ——
Ludo 的落点永远是「当前步数 + 点数」，画上去等于向玩家承诺一条不存在的规则。
外圈除了四个入场格和四个 ★ 之外，**其余格子一律米白**。

## 5. 本批提示词摘要

- **背景**：从大厅概念图移除全部 UI，只保留深蓝星空、软云层和中央柔和蓝光。
- **Logo**：四颗红黄蓝绿玩具棋子围绕一枚白色骰子，金色 `LUDO` 标题，纯品红键色背景。
- **弹窗**：不带文字的深蓝圆角厚边框面板，糖果塑料质感，纯品红键色背景。
- **按钮**：不带文字的紫 / 青 / 黄 / 绿 / 禁用灰蓝五种统一圆角按钮。
- **图标**：统一白色与蓝色高光 3D 图标组，不带 emoji、不带文字。
- **头像**：统一圆形边框的六名卡通玩家头像与一个机器人头像。
- **棋盘**：标准 15×15 Ludo 十字盘（外圈 56 格），红黄蓝绿四区、每家 6 格终点道、四个彩色入场格带方向箭头、
  四个 ★ 安全格，**其余格子米白，无捷径无虚线**。
