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
- **当前恢复点：还原流程第 2 步（NumPy 按元素边界切组件）**，素材源为已选定的 `main-room-starry-v3_84001.png` + 8 张星空弹窗（91201/91302/91402/91501/91602/91702/91802/91902）；`84001` 与 `84002`、`75002` 需同时保留供皇冠单独切图。

## 工作约定（任何虚拟机上的会话都适用）

- 与用户交流一律用**中文**，包括过程说明。
- 设计/出图迭代：收到新意见先把累计修改清单列成表回给用户，等用户说“开始”再生成；本任务里用户已授权主界面验收通过后自行推进还原。
- 云端 ComfyUI 一次最多排 2–4 张，按批串行；需要特定布局时线框放 image1。
- 所有项目文件都在 Mac 共享盘：`/Users/mac/projects/cocos-game-studio`（各 Linux 虚拟机挂载路径不同，文中路径一律相对工作室根）。git 状态/提交通过 `ssh -o BatchMode=yes mac@192.168.64.1` 在 Mac 原生路径执行；Mac 上 node 在 `/Users/mac/.local/bin`，gh 在 `/opt/homebrew/bin`。`node_modules` 只能由用户在 Mac 上安装。
- 推送 game4 `main` 会直接触发生产发布：先得到用户确认，并由用户在 Mac 上执行 `git push origin HEAD:main`；推送前核对远端 `main` 未前进。
- 浏览器验收可用用户 Mac 上的调试 Chrome（`/control` 流程，CDP 端口 9222，独立 profile `~/.chrome-debug`）；绝不关闭用户的 Chrome。
- 不把任何密码、密钥或云主机 SSH 凭据写入仓库文件或文档。

## 云端生成

- ComfyUI：`https://by47y6ehljlr7fqf-80.container.x-gpu.com/`（RTX 4090）。**一次最多排 2–4 张**，并发 22 张时实例崩溃过（用户已重启）。提交前 GET `/system_stats`。
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
- 候选仓库 `release-candidates/pwa-rtc-voice`（分支 `feat/voice-rtc-20260910` 跟踪 `origin/main`）：本目录与 `evidence/voice-room-redesign/before/` 尚未提交。
