# 语聊房星空改版 · 绿幕重画生产清单（方案 B）

> 由 `cutouts/*/manifest.json` 的 65 个参考 tile 归并而来。归并依据：同一语义槽位只出一份素材，
> 尺寸差异交给九宫格拉伸，内容差异（头像、文字、数字）交给 DOM/运行时。
> `cutouts/` 下的 tile **只作样式参考和尺寸依据**，不是生产素材（矩形裁切路线已作废，见 HANDOFF.md）。

## 归并规则

- **九宫格底板**：同族不同宽度的胶囊/面板只出一份，标注九宫格边距，宽度由 CSS 拉伸。
- **头像框**：运行时头像是用户自己的 emoji/照片，只出"框"不出"内容"。
- **状态变体**：同一控件的金色/红色/禁用态各出一份（颜色不能靠 CSS 滤镜伪造，会破坏金属质感）。
- **纯文字标签**：概念稿里烘焙的文字一律不出素材，由 DOM 渲染。

## A. 麦位区（8 个槽位）

| Slot | 参考 tile | 目标比例 | 九宫格 | 说明 |
|---|---|---|---|---|
| `seat.frame.occupied` | main-room/seat-frame-occupied-plain | 1:1 | 否(SIMPLE) | 金色花丝圆框，中心透明供头像垫底 |
| `seat.frame.speaking-ring` | main-room/seat-frame-occupied-speaking | 1:1 | 否 | 说话态金色光环，独立叠加层 |
| `seat.frame.empty` | main-room/seat-empty-frame | 1:1 | 否 | 暗紫环 + 发光麦克风（"点击上麦"文字不烘焙） |
| `seat.accent.moon` | main-room/moon-crescent-accent | 自由 | 否 | 顶部月牙挂饰，独立叠加 |
| `seat.badge.corner` | main-room/seat-badge-corner | 1:1 | 否 | 右上角圆形徽章底（管理/房主） |
| `seat.badge.crown` | 84002 / 75002 | 自由 | 否 | **概念稿 84001 缺此元素**，需单独出图 |
| `seat.nametag` | main-room/name-lv-tag-row1 | 九宫格 | 是 | 名牌胶囊底板，名字+Lv 由 DOM 渲染 |
| `avatar.frame.ornate` | popup-member/avatar-photo-frame | 1:1 | 否 | 金色雕花头像框（成员操作弹窗用，比麦位框更粗） |

## B. 通用控件（9 个槽位，跨全部弹窗复用）

| Slot | 参考 tile | 九宫格 | 归并了哪些 |
|---|---|---|---|
| `button.capsule.gold` | popup-confirm/button-primary-outline | 是 | + invite-button-gold + button-copy-gold + button-share-gold |
| `button.capsule.red` | popup-confirm/button-destructive | 是 | + invite-button-red + button-full-width-red |
| `button.capsule.disabled` | popup-invite/invite-button-already | 是 | 禁用/已完成态 |
| `button.icon.round` | main-room/bottombar-icon-button-1 | 否 | + close-x-button + topbar-settings-button + bottombar-mic-button（同一圆按钮底，图标分离） |
| `button.tile.neutral` | popup-member/icon-button-neutral | 是 | 2×2 功能格中性态 |
| `button.tile.warning` | popup-member/icon-button-warning | 是 | 2×2 功能格警示态 |
| `row.bubble.bg` | main-room/chat-bubble-plain | 是 | + invite-row-bubble-bg + settings-row-bubble-bg + member-row-bubble-bg |
| `input.field` | main-room/bottombar-input-field | 是 | + search-bar-frame |
| `avatar.circle.plain` | main-room/chat-avatar-emoji | 否 | + invite-avatar-circle + member-row-avatar + avatar-circle-plain-ring |

## C. 胶囊与徽章（6 个槽位）

| Slot | 参考 tile | 九宫格 | 归并了哪些 |
|---|---|---|---|
| `pill.status.gold` | popup-members-list/status-pill-gold | 是 | + topbar-online-capsule + chat-badge-pill |
| `pill.status.red` | popup-members-list/status-pill-red | 是 | + topbar-pending-capsule（红/紫态） |
| `pill.role.badge` | popup-member/badge-role-pill | 是 | 身份徽章（成员/管理/房主） |
| `pill.count.small` | popup-manage/notif-count-pill | 是 | 小计数气泡 |
| `badge.lv` | popup-requests/lv-badge-pill | 否 | + badge-icon-lv-diamond |
| `badge.heart` | popup-members-list/badge-icon-heart | 否 | 心形身份图标（金/红两色） |

## D. 面板与装饰（5 个槽位）

| Slot | 参考 tile | 九宫格 | 说明 |
|---|---|---|---|
| `panel.frame.ornate` | popup-confirm/panel-frame-full | 是 | 弹窗主面板，金色雕花边框，九宫格拉伸适配各弹窗高度 |
| ~~`panel.corner.ornament`~~ | — | — | **已废弃 2026-09-12**，见下方废弃记录 |
| `panel.header.room-info` | popup-manage/room-info-header-panel | 是 | 房间信息头部底板 |
| `icon.chevron` | popup-requests/chevron-expand-icon | 否 | 展开箭头 |
| ~~`decor.stage-light`~~ | — | — | **已废弃 2026-09-12**，见下方废弃记录 |

## E. 卡片与插画（4 个槽位）

| Slot | 参考 tile | 九宫格 | 说明 |
|---|---|---|---|
| `card.game.frame` | popup-games/game-card-frame | 是 | 游戏卡边框（游戏图标是各游戏自己的资产，不在此出图） |
| `card.game.hot-tag` | popup-games/hot-tag-ribbon | 否 | 角标丝带 |
| `button.play.small` | popup-games/play-triangle-button | 否 | + mic-pill-button（开玩按钮两种形态） |
| `illustration.leave-room` | popup-confirm/illustration-fox-door | 否 | 离房确认插画，单弹窗专属 |

---

**合计 30 个槽位**（原 65 个 tile 归并为 32，再废弃 2 个）。其中 `seat.badge.crown` 概念稿缺失，
已按 84002 的美术风格另行生成。

## 废弃槽位记录（2026-09-12，Owner 同意）

| Slot | 废弃原因 | 替代方案 |
|---|---|---|
| `panel.corner.ornament` | 出图是封闭的圆形涡卷，不是贴在面板四角的 L 形转角装饰；且 `panel.frame.ornate` 面板贴图本身已自带雕花边框与四角纹样 | 由 `panel.frame.ornate` 承担，不需要独立角饰 |
| `decor.stage-light` | 出图是带小字标签的横条而非舞台光晕——其参考 tile 本身就是切坏的（把麦位名牌文字一并切入），坏参考污染了结果；且该光晕在 84001 中本就画在背景插画上 | 归入背景层（`night-room.webp` 一类），不作为独立 UI 素材 |

> 配置已在 `greenscreen-trials/slots.py` 中整段注释保留（含废弃原因），未直接删除，便于日后追溯或恢复。

## 交付状态（2026-09-12）

30 个槽位全部产出合格素材，共 57 个 RGBA PNG 在 `greenscreen-assets/`（每槽位 2 个 seed，
`panel.corner.ornament` 的次品与两个废弃槽位的素材已移除）。全部素材的绿色溢色残留与
全透明像素 RGB 均为 0。

**质感偏弱但可用（Owner 未要求返工）**：`card.game.hot-tag`（纯橙红圆角方块，缺丝带形态）、
`panel.header.room-info`（朴素紫色胶囊条）。二者均为底板件、文字由 DOM 渲染，不影响功能。

## 生产化与九宫格标注（2026-09-12 完成）

`greenscreen-trials/nine_slice.py` 已把 30 个槽位处理成可直接使用的贴图，产物在
**`greenscreen-final/`**（每槽位一个 PNG + `nine_slice.json` 记录尺寸、类型、边距和 CSS 片段）。

三个关键处理：

1. **裁到内容边界**，阈值 `alpha > 16`。个别素材（`button.capsule.gold`）背景残留了 alpha 1~8 的
   微弱值，用低阈值会裁出整张画布；alpha<16 透明度不足 6%、肉眼不可见，切掉不影响视觉。
2. **按高度缩放到概念稿尺寸**。概念稿画布 768 宽对应真机 393 CSS 像素（≈2 倍），所以概念稿里的
   box 尺寸正好≈2x CSS 尺寸，适配 2x DPR。宽度不强行对齐——九宫格件靠拉伸适配。
3. **边距 = 外发光带宽 + 圆角半径**。先用 `alpha > 96` 分出实体（描边+底面），实体到裁剪边界的
   距离即外发光带；再在实体掩码上沿中线扫描，找垂直跨度达到 97% 最大值的位置作为圆角结束点。

15 个九宫格件（SLICED）的边距：

| Slot | 尺寸 | slice T/R/B/L |
|---|---|---|
| `button.capsule.gold` | 140×70 | 27 / 29 / 26 / 29 |
| `button.capsule.red` | 179×70 | 22 / 25 / 21 / 26 |
| `button.capsule.disabled` | 151×70 | 22 / 26 / 22 / 26 |
| `row.bubble.bg` | 236×66 | 27 / 24 / 26 / 33 |
| `input.field` | 316×78 | 20 / 28 / 20 / 28 |
| `panel.frame.ornate` | 711×509 | 61 / 67 / 61 / 69 |
| `panel.header.room-info` | 439×132 | 23 / 34 / 21 / 35 |
| `seat.nametag` | 142×46 | 13 / 19 / 13 / 19 |
| `pill.status.gold` | 74×34 | 11 / 14 / 11 / 14 |
| `pill.status.red` | 80×34 | 11 / 14 / 11 / 14 |
| `pill.role.badge` | 173×54 | 14 / 19 / 14 / 19 |
| `pill.count.small` | 43×28 | 10 / 12 / 9 / 9 |
| `button.tile.neutral` | 153×152 | 18 / 18 / 18 / 20 |
| `button.tile.warning` | 157×154 | 24 / 23 / 23 / 23 |
| `card.game.frame` | 158×241 | 21 / 18 / 22 / 18 |

其余 15 个为 SIMPLE 件，不拉伸，按原尺寸使用。

**拉伸验证已通过**：`greenscreen-trials/nine-slice-check.png` 把按钮/气泡/输入框/状态胶囊分别拉到
最小、原始、最大三种宽度，圆角、描边粗细和气泡尖角均无变形。

**一个待办**：`seat.badge.crown` 的参考图是整屏概念图而非 cutouts tile（该元素概念稿里没有），
脚本无法反查目标尺寸，当前保持裁剪结果，替换时需按实际麦位比例手动定尺寸。

**下一步**：进入换肤替换阶段，落点见 `RESKIN_PLAN.md`。

## 试样结论（2026-09-11，已通过）

三个代表性槽位 `button.capsule.gold`（seed 95101）、`seat.frame.occupied`（95202）、
`seat.frame.empty`（95301）全部通过，**方案 B 路线成立**：

| 验收项 | 结果 |
|---|---|
| 质感复刻 | 金色渐变/双层描边/花丝雕花/丝带/发光麦克风均与概念稿一致 |
| 中心留空 | 头像框中心完全透明，可直接垫运行时头像 |
| 绿色溢色残留 | 0 px（三个素材） |
| 全透明像素 RGB 归零 | 0（项目硬标准，三个素材均通过） |

**抠图关键结论**：简单色键处理不了半透明边缘，空麦位外发光会带一圈淡绿。
`greenscreen-trials/chroma_key.py` 改用标准 unpremultiply 解法后溢色归零——
从四角中位数采样实际绿幕色（模型画的绿幕并非正好 #00FF00），按
`前景 = (观察色 - (1-alpha)*绿幕色) / alpha` 反解，再对反解后仍绿色占优的像素压 G 通道兜底。
**这套脚本是全部素材的统一抠图入口，不要退回简单阈值色键。**

已知待修：`button.capsule.gold` 的外发光触到画布边缘（`touches_edge: True`），批量时已加大画布
并在 prompt 中强调"绝对不能触碰画面边缘"。

## 生产脚本

- `greenscreen-trials/slots.py` —— 32 个槽位的参考图/画布尺寸/提示词配置
- `greenscreen-trials/batch_run.py` —— 串行批量生成 + 立即抠图 + 质量指标，写 `batch_report.json`
  （**必须串行**：该实例并发 22 张时崩溃过）
- `greenscreen-trials/chroma_key.py` —— 绿幕抠图 + 去溢色 + 断言
- `greenscreen-trials/make_asset_sheet.py` —— 拼验收总览图（深紫底 + 棋盘底双联）
- 产物：绿幕原图在 `greenscreen-trials/raw/`，抠好的 RGBA 素材在 `greenscreen-assets/`
