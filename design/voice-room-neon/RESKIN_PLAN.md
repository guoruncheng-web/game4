# 语聊房星空改版 · 换肤实施说明（DOM / CSS 落点）

> 2026-09-11 只读调研结论，供素材就绪后的替换阶段使用。
> 原则沿用 HANDOFF.md：**React 组件结构与逻辑不改，只换贴图、调尺寸**——但有两处例外，见 §5。

## 1. 现状要点（改造前必读）

1. **`voice-room-v2.css` 是死代码**。JSX 上挂着 `voice-room-v2` 类名，但该样式表从未被 import。
   真正生效的是 `src/app/voice-reference.css` 的 `.voice-room-starry` 段（约 88–213 行）
   与 `src/app/voice-layout.css`，两者在 `layout.tsx:11-12` 引入。改造时不要被 v2 误导。
2. **线上已经是暗色星空主题**，不是从零换肤，是在既有星空皮肤上提升质感。
3. **已经在用图片的只有 3 处**：`night-room.webp`（房间底图）、`moon-frame.webp`
   （麦位金框，靠 `::before` 叠加，voice-reference.css:179）、若干 v5 atlas 雪碧图。
   其余全是纯 CSS（border + border-radius + background + box-shadow）画出来的。
4. **麦位数量本来就是 8**。`VoiceRoomPage.tsx:116` 按 `room.maxSpeakers` 生成座位数组，
   后端 `backend/apps/voice/src/voice-room.service.ts:126` 默认 `VOICE_MAX_SPEAKERS ?? 8`
   且校验强制 ≥ 8，fixture 也是 8。线上看着像"2 大 + 若干小"纯粹是 CSS 造成的（见 §5.1）。
   **把布局改成 2×4 等大不涉及后端、协议、容量或 RTC 验收。**

## 2. 槽位 → className 映射

| 槽位 | className | JSX 位置 | CSS 位置 |
|---|---|---|---|
| `seat.frame.occupied` | `.voice-seat.is-occupied > .voice-seat-portrait` | RoomPage:147 | ref:115,182（**直接替换 ref:179 的 `moon-frame.webp` 即可**） |
| `seat.frame.empty` | `.voice-seat > .voice-seat-portrait`（无 is-occupied） | RoomPage:147 | ref:113 |
| `seat.nametag` | `.voice-seat b` | RoomPage:148 | ref:120（**当前是裸文字，无底板**，见 §5.2） |
| `seat.badge.corner` | `.voice-seat b > i.voice-role-owner / .voice-role-moderator` | RoomPage:148 | ref:122-123 |
| `seat.frame.speaking-ring` | `.voice-speaking-badge` | RoomPage:147 | ref:203-208 |
| 顶栏各件 | `.voice-room-header` / `.voice-room-title` / `.voice-header-invite` / `.voice-header-members` | RoomPage:129-135 | ref:97-105 |
| `pill.status.gold` | `.voice-room-status > span` | RoomPage:136 | ref:107 |
| 待审批胶囊 | `.voice-requests-pill` | RoomPage:136 | ref:202 |
| `row.bubble.bg` | `.voice-message`（`.is-mine` 为变体） | RoomPage:157 | ref:131,136 |
| `input.field` | `.voice-composer` | RoomPage:169 | ref:139-140 |
| `button.icon.round` | `.voice-game-list-entry` / `.voice-dock-more` / `.voice-microphone-toggle` | RoomPage:170-171 / AudioPanel:78 | ref:144,196 |
| `panel.frame.ornate` | `.voice-action-sheet` / `.voice-confirm` | SheetFrame:188 / Confirm:247 | layout:95 / ref:160 |
| `button.capsule.gold` / `.red` | 弹窗内**多数是裸 `<button>` 无类名**，仅 `.is-secondary`(:208)、`.is-danger`(:236) | RoomPage:199,208,236 | layout:104 |

## 3. 双边框陷阱：换贴图时必须成对删掉的 CSS

贴图自带描边，如果不删原有的 CSS 边框会叠成双层：

- 麦位：ref:113 `border:1px` + `box-shadow:inset`；ref:115 `border:2px solid #f1dcac` + 两层 box-shadow
  （ref:182 已把 border 改 transparent，但 box-shadow 仍在，要一并去）
- 气泡：ref:131 `border:1px solid #dfd5f140` + `border-radius:9px`；`.is-mine` 变体 ref:136
- 输入框：ref:139 `border-radius:25px` + `background:var(--room-glass)`
- 圆按钮：ref:144 / ref:196 `border-radius:50%` + `background:var(--room-glass)`
- 状态胶囊：ref:107 / ref:202 的 `border` + `border-radius`

## 4. 禁区清单（公网 RTC 验收依赖，禁止改名/删除）

| 项 | 位置 | 现状 |
|---|---|---|
| `.voice-microphone-toggle` | VoiceAudioPanel.tsx:78 | 与 `data-publish` 同一个 button |
| `data-publish` | VoiceAudioPanel.tsx:78 | 值 `'allowed'` / `'denied'` |
| `.voice-speaking-badge[data-speaking-uid]` | VoiceRoomPage.tsx:147 | 内含 3 个 `<i/>` 声波条 |
| 空麦位 aria-label | VoiceRoomPage.tsx:143 | 实际拼写 `` `${index + 1}号空麦位，申请上麦` ``，**全角逗号** |
| `.voice-message-list` | VoiceRoomPage.tsx:155 | 带 `aria-live="polite"` |
| `[role="alertdialog"]` | VoiceRoomPage.tsx:247 | ConfirmModal；:125 的 closest() 也引用，改动需同步 |
| "继续上麦" / "确认下麦" | VoiceRoomPage.tsx:180 | `cancel="继续上麦"` `confirm="确认下麦"`（仅 seat 分支） |

**额外发现的疑似测试钩子**（建议一并冻结）：`aria-pressed`（AudioPanel:78，麦克风开关态）、
`.voice-playback-retry` + `aria-label="恢复房间声音"`（AudioPanel:79，autoplay 解锁验收要点）、
`id="voice-confirm-title"`（:247 被 aria-labelledby 引用）、`aria-label="打开游戏列表"`(:170)、
`aria-label="发送房间消息"`(:169)、`.voice-room-toast[role="status"]`(:165)。

> 注：`tools/sim/voice/rtc-browser-test.mjs` 在 backend 仓，不在本仓库。以上按 HANDOFF 清单逐条核对，
> 但**无法反向确认验收脚本是否还依赖别的选择器**——改造后仍需跑一次完整公网验收。

## 5. 三处不是"纯换图"的改动

1. **删 `.is-featured`**：`VoiceRoomPage.tsx:143` 给 `index < 2` 加了 `is-featured`，
   CSS ref:112 `grid-column:span 2` + ref:114 放大，这就是线上"2 大 + 小"的来源。
   新稿要 8 个等大 2×4，需删掉该类名与 6 处派生规则（ref:114/119/121/169/180/204）。
   不涉及后端与协议（见 §1.4）。
2. **`seat.nametag` 要从裸文字改成带底板**：`.voice-seat b` 现在只有文字样式，
   加底板需新增 `background-image` + `padding`。
3. **弹窗配色整体翻转**：弹窗底板现在是浅色（白底深字，layout.css:95），
   换成金色雕花暗底面板后，内部所有文字与按钮配色要从浅底翻成暗底。
   这是本次改造最大的一块工作量，不是换一张图能了事。
