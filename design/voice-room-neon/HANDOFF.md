# 语聊房霓虹改版 · 交接（2026-09-11）

## 目标

把 PWA 语聊房**房间内**的所有界面和弹窗重做成“游戏语聊”风格并按流程还原上线；**语聊大厅与创建房间这次不做**。

## 已定的决定（用户确认）

- 风格：**“星空主题”**（现行，取代已否决的“乙 · 霓虹派对”）——以线上现行语聊房主题为基准（月夜湖面、丝带、金色花丝头像框、低饱和优雅色调），在此基础上加强星云/流星/萤火氛围、提升游戏 UI 质感；风格板见 `style-board-starry.png`，参考截图见 `evidence/voice-room-redesign/before/01-room.png`。
- 主界面必须 **8 个麦位，上下两排各 4 个，大小一致**；麦位 = 圆形花丝头像框 + 名牌（角色徽章“房主/管理”只出现一次，名字 + Lv），说话中带金色声波环；空位是暗色环 + 发光麦克风 + “点击上麦”，两个空位样式统一。上线头像是用户自己的 emoji/照片，所以必须是圆形头像框，不画整只动物坐椅子。
- 主界面已定稿 `main-room-candidates/main-room-starry-v3_84001.png`（用户回复“可以”确认）。8 张弹窗已按星空风格重出并由 Claude 自行验收选优（授权沿用原有“自己验收，通过即按流程还原”的工作方式），选定结果见 `README.md`：游戏列表 91201、邀请好友 91302、上麦申请 91402、成员操作 91501、房间管理 91602、成员列表 91702、设置小弹窗(关联游戏) 91802、确认弹窗 91902。图内部分文字乱码无妨，还原时文字全部由 DOM 动态渲染。

## 当前进展（2026-09-11 更新）

- **“乙 · 霓虹派对”方向已否决（历史）**：用户看过选定的 75002 后反馈“整体氛围不够，要换风格方向”，该方向及原批准记录已标 superseded，详见 `README.md` 历史记录一节。中途还试过“方向 D · 糖果嘉年华”（`main-room-candy-v1_81001/81002`），用户改口要求“以现在线上的房间主题的风格再优化”，最终定为“星空主题”。
- **主界面星空方向已定稿**：以 `wireframe-8seats-v2.png` 定布局、线上截图 `01-room.png` 取风格，共跑 4 轮（81001–84002）；`82001/82002` 照搬了线上“2 大+4 小”旧布局未过 8 麦位 2×4 验收；`83001/83002` 布局过关但皇冠位置错、空位样式不统一；以 `83001` 为基准精修出 `84001/84002`，`84001` 房主徽章/空位样式基本到位，用户确认“可以”，唯房主金冠与说话声波环重叠冲突，计划在切图阶段从 `84002`/`75002` 单独复用皇冠切图并独立定位，不依赖概念图位置示意。完整结论见 `README.md`。
- **8 张弹窗已按星空风格重出并完成选优**：`popup-candidates/` 下 91201–91902 共 16 张（每类 2 个 seed），已逐一审阅并选出每类最优版本，落选原因（顶栏文字重叠、按钮图标破损、色调偏离、空麦位样式不一致等）记入 `README.md`。
- **⚠️ 矩形裁切路线已作废（2026-09-11，用户否决）**。原步骤 2「从概念图上按元素边界裁切组件」已实际执行过一轮（`cutouts/` 下 main-room 24 个 + popup-confirm 4 个 + popup-requests 4 个 + popup-games 8 个 + popup-invite 7 个 + popup-member 5 个 + popup-manage 7 个 + popup-members-list 6 个），用户看过后判定"切效果太差了"，**该路线停止，产物只保留作位置/尺寸参考，不得作为生产素材使用**。失败原因有两条，第二条是根本性的：
  1. 靠肉眼从缩放过的坐标网格图上估坐标不可靠——一轮内连续切歪 6 次（lv 徽章、开玩按钮、播放三角、热门角标、复制/分享按钮、房间头像方框），每个都要来回试 2–3 轮。文档里"用 NumPy 按元素边界切"指的是连通区/边缘检测算法定界，不是人眼读数。
  2. 即使坐标完全精确，矩形裁切也拿不到干净素材：概念图里按钮、头像框、胶囊的外发光、半透明和渐变都与星空背景深度融合，裁出来必然带一块背景，边缘还会切断外发光或切进相邻元素（如 `member-row-bubble-bg` 把右侧状态胶囊和"听众"文字一并切入）。
- **现行路线：方案 B —— 绿幕重画（用户 2026-09-11 指定）**。放弃从概念图裁切，改为用 Qwen-Image-Edit 参照概念稿样式，把每个组件**单独画在纯绿幕背景上**，直接得到可抠透明的干净素材；原步骤 3（去字补底板放大 2 倍）与之合并，不再需要先精确裁切。
  - 执行顺序：先拿 2–3 个代表性组件做试样（建议：金色按钮、金色花丝头像框、空麦位暗环+发光麦克风），验证模型能否复刻住金色花丝质感与配色；试样通过后再批量出全部组件，随后进入步骤 4 的绿幕抠透明（清零全透明像素 RGB、标九宫格边距）。
  - **生产清单见 `ASSET_SLOTS.md`**：65 个参考 tile 已按"一个语义槽位一份素材"归并为 **32 个槽位**（同族不同宽度的胶囊合并为一份九宫格底板；头像只出框不出内容；文字一律 DOM 渲染）。试样先跑其中 3 个：`button.capsule.gold`、`seat.frame.occupied`、`seat.frame.empty`。
  - `cutouts/*/manifest.json` 的 `box_px` 仍可用来确定各槽位的目标宽高比与页面内相对尺寸。
  - ~~阻塞：云端 ComfyUI 全部接口 503~~ → 用户已于 2026-09-11 重启，实例恢复正常。

- **素材生产已完成（2026-09-12）**：**30 个槽位全部产出合格素材**，共 57 个 RGBA PNG 在
  `greenscreen-assets/`（每槽位 2 个 seed）。全部素材绿色溢色残留与全透明像素 RGB 均为 0，
  质量指标见 `greenscreen-trials/batch_report.json`，验收总览图 `greenscreen-trials/final-sheet.png`。
  槽位清单、废弃记录与交付状态见 `ASSET_SLOTS.md`。
  - 生产过程中的两次返工：`row.bubble.bg` 首轮出图偏蓝偏暗无质感，改 prompt（强调深紫玻璃质感 +
    细描边 + 顶部高光 + 尖角要小）后通过；`panel.corner.ornament` 首轮触边，加大画布后仍形态跑偏，
    最终废弃。
  - **已废弃 2 个槽位（Owner 同意）**：`panel.corner.ornament`（与 `panel.frame.ornate` 自带的
    四角纹样冗余）、`decor.stage-light`（其参考 tile 本身切坏了导致出图带文字；该光晕本就属背景层）。
    配置在 `slots.py` 中整段注释保留，未删除。
  - 质感偏弱但可用、Owner 未要求返工：`card.game.hot-tag`、`panel.header.room-info`；
    `button.tile.neutral` / `warning` 出图接近正方形（参考稿约 1.6:1），二者是九宫格拉伸件，
    比例由 CSS 控制，不影响使用。
  - **⚠ 云端实例稳定性（2026-09-11 实测，已两次踩到）**：该 ComfyUI 实例在连续生成约 50 张图
    （25 个槽位 × 2 seed）之后会挂掉，全部接口返回 HTTP 503，且不会自行恢复，必须由用户在云主机
    控制台手动重启。表现是批量脚本后段连续报 urllib/SSL 读取异常——**这不是脚本 bug，也不是
    生成质量问题**，先 `GET /system_stats` 确认是不是 503 再判断。
    建议后续分批跑（每批 5–8 个槽位，之间留间隔），不要一口气排 25 个以上。
    首轮 1–24 个槽位正常，第 25 个之后开始失败；重启后再次尝试 6 个槽位时实例已再次 503。

- **换肤落点已调研完毕，见 `RESKIN_PLAN.md`**：槽位→className 映射、必须成对删除的 CSS 边框
  （否则与贴图描边叠成双边框）、公网 RTC 验收禁区清单、以及三处"不是纯换图"的改动
  （删 `.is-featured` 改 2×4 等大、`seat.nametag` 从裸文字加底板、弹窗配色从浅底整体翻暗底）。
  其中已确认：**麦位数量本来就是 8，改 2×4 布局不涉及后端、协议与容量**。
  - 绿幕建议用纯绿 #00FF00 + 去溢色；金色描边与绿幕不冲突，但如出现绿色溢色需在抠图后核对边缘。

## 工作约定（任何虚拟机上的会话都适用）

- 与用户交流一律用**中文**，包括过程说明。
- 设计/出图迭代：收到新意见先把累计修改清单列成表回给用户，等用户说“开始”再生成；本任务里用户已授权主界面验收通过后自行推进还原。
- 云端 ComfyUI 一次最多排 2–4 张，按批串行；需要特定布局时线框放 image1。
- 所有项目文件都在 Mac 共享盘：`/Users/mac/projects/cocos-game-studio`（各 Linux 虚拟机挂载路径不同，文中路径一律相对工作室根）。git 状态/提交通过 `ssh -o BatchMode=yes mac@192.168.64.1` 在 Mac 原生路径执行；Mac 上 node 在 `/Users/mac/.local/bin`，gh 在 `/opt/homebrew/bin`。`node_modules` 只能由用户在 Mac 上安装。
- 推送 game4 `main` 会直接触发生产发布：先得到用户确认，并由用户在 Mac 上执行 `git push origin HEAD:main`；推送前核对远端 `main` 未前进。
- 浏览器验收可用用户 Mac 上的调试 Chrome（`/control` 流程，CDP 端口 9222，独立 profile `~/.chrome-debug`）；绝不关闭用户的 Chrome。
- 不把任何密码、密钥或云主机 SSH 凭据写入仓库文件或文档。

## 云端生成

- ComfyUI：`https://8w4bwh62z5nmmykf-80.container.x-gpu.com/`（RTX 4090 D，2026-09-12 起的新实例；
  旧实例 `by47y6ehljlr7fqf-80` 已挂掉废弃）。**一次最多排 2–4 张**，并发 22 张时实例崩溃过。
  提交前 GET `/system_stats`。**换实例时**：新地址就是 SSH 主机名换个端口后缀，
  形如 `https://<ssh-host-id>-80.container.x-gpu.com`；三个脚本已支持 `COMFY_URL` 环境变量覆盖，
  也可直接改脚本里的默认值。换实例后先用 `/object_info/UNETLoader` 确认模型还在。
- 脚本（共享盘）：`<工作室根>/.tmp/comfy/`（Mac：`/Users/mac/projects/cocos-game-studio/.tmp/comfy/`）
  - `comfy_qwen_edit.py <out_dir> <prefix> <prompt> <W> <H> <seeds,> <ref1,ref2,…>`：Qwen-Image-Edit-2511 + Lightning 4 步，带参考图。
  - `comfy_qwen_t2i.py <out_dir> <prefix> <prompt> <W> <H> <seeds,>`：Qwen-Image 2512 + Lightning 4 步，纯文字（中文渲染好）。
  - `comfy_zimage.py`：Z-Image Turbo 纯文字。
- 尺寸统一 768×1664（与 393×852 同比例）。

## 下一步（用户指定的还原流程）

1. 主界面按方案 2 出 2 张 → 验收 8 麦位 2×4 → 选定后连同 8 张弹窗概念写入批准记录（仿 `design/pwa-prepare/README.md`）。
2. 用 NumPy 按元素边界把每个组件单独裁出：顶栏房名牌、在线胶囊、设置/返回按钮、待审批胶囊、麦位框(有人/空)、声波环、角色徽章、名牌/Lv 标签、聊天气泡、底栏按钮与输入框、弹窗面板框、标题牌、关闭 ✕、各类按钮、列表行、操作格、游戏卡框、确认弹窗插画等。
3. 概念图按钮/标签上烘焙了文字：用 Qwen-Image-Edit 去字、补全底板，同时放大到 2 倍，材质配色装饰不变。
4. 抠透明底（霓虹含洋红/青色，建议用纯绿 #00FF00 作色键 + 去溢色），清零全透明像素 RGB，标九宫格边距；替换进现有房间页面——React 组件结构与逻辑不改，只换贴图、调尺寸（`src/components/VoiceRoomPage.tsx`、`VoiceAudioPanel.tsx`、`VoiceGameSheet.tsx`，样式在 `src/app/voice-reference.css` / `voice-layout.css`）。
5. 概念稿未画的状态（按下/禁用等）由同一张切图派生。
6. 字号按概念稿实测值重排，逐屏截图与概念稿叠图对比，直到位置、大小、质感对齐。
7. 本地验收：fixture 网关 `.tmp/voice-controls-fixture.mjs`（17220）+ `PORT=3342 BACKEND_GATEWAY_URL=http://127.0.0.1:17220 pnpm start`；现状截图脚本 `.tmp/capture-room-ui.mjs`（连 Mac Chrome 调试端口 9222，截 14 个画面到 `evidence/voice-room-redesign/before/`）。
8. 发布：用户在 Mac 上自己 `git push origin HEAD:main`（本机推送常超时）；需先更新 `public/sw.js` VERSION、`src/lib/pwa-version.ts`、`deploy.yml` 三处 PWA_CACHE_VERSION（当前线上 v91），`test/pwa/pwa-version.test.mjs` 会校验。若改动公网 RTC 验收依赖的选择器（`.voice-microphone-toggle`、`data-publish`、`.voice-speaking-badge[data-speaking-uid]`、`button[aria-label="N号空麦位，申请上麦"]`、`.voice-message-list`、`[role="alertdialog"]`、“继续上麦/确认下麦”文字），必须同步后端 `tools/sim/voice/rtc-browser-test.mjs` 并更新 `deploy/backend-revision.txt`。

## 现状

- 线上：frontend `2de205c`（PWA v91，含“准备环境中”与顶部修复），Actions 34566337098 成功。
- 候选仓库 `release-candidates/pwa-rtc-voice`（分支 `feat/voice-rtc-20260910` 跟踪 `origin/main`）：
  概念图与现状截图已于 2026-09-11 提交（`f820005` / `c545c92`）；此后新增的
  `cutouts/`、`greenscreen-assets/`、`greenscreen-trials/`、`ASSET_SLOTS.md`、`RESKIN_PLAN.md`
  **尚未提交**。推送仍须由用户在 Mac 上执行。
