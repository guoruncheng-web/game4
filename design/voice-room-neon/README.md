# 语聊房“星空主题”改版 · 概念与批准记录

## 当前批准结论(2026-09-11,现行)

- **Concept ID**:`VOICE-ROOM-STARRY-84001`(主界面)+ `VOICE-ROOM-STARRY-POPUPS-9x`(8 张弹窗)
- **范围**:PWA 语聊房**房间内**的主界面与 8 个弹窗(游戏列表、邀请好友、上麦申请、成员操作、房间管理、成员列表、设置小弹窗(关联游戏)、确认弹窗)。**语聊大厅与创建房间不在本次范围**。仅授权本目录列出的资产族。
- **状态**:approved。“乙 · 霓虹派对”方向已被 Studio Owner 否决(见下文 superseded 记录);Owner 改为“以现行线上语聊房主题(月夜湖面、丝带、金色花丝头像框)为基准再优化(加强星云/流星/萤火氛围、提升游戏 UI 质感)”。主界面按此方向出 5 轮(81001–84002),`main-room-candidates/main-room-starry-v3_84001.png` 经 Owner 确认“可以”定稿。8 张弹窗随即按同一风格重出(91201–91902,每张 2 个 seed),由 Claude 自行验收选优(授权延续自本目录原有“自己验收,通过即按流程还原”的工作方式)。
- **已否决 / 未选(星空方向内)**:
  - `main-room-candy-v1_81001/81002`(方向 D · 糖果嘉年华):用户否决,改回星空方向未再使用。
  - `main-room-starry-v1_82001/82002`:氛围到位但照搬了线上截图“2 大 + 4 小”麦位布局,未过 8 麦位 2×4 等大验收。
  - `main-room-starry-v2_83001/83002`:8 麦位 2×4 等大通过,但房主皇冠位置不对、空麦位数量与样式不统一、部分文字乱码;`83001` 选为下一轮精修基准。
  - `main-room-starry-v3_84002`:以 83001 精修,皇冠回来了但和说话声波环一起被放到同一麦位、覆盖冲突;未选,弃用。
  - 各弹窗每类另一个 seed:`p02-games_91202`(顶栏搜索框/关闭按钮退化,背景聊天气泡穿透面板)、`p03-invite_91301`(顶栏“待审批”文字重叠、邀请按钮出现糖果状破损图标)、`p04-requests_91401`(顶栏文字与齿轮图标重叠)、`p05-member_91502`(整体偏洋红色调,与已批准的深蓝紫星空基调不一致)、`p06-manage_91601`(底部两个按钮均为红色,状态区分不足)、`p07-members_91701`(空麦位改成玻璃球造型,与已批准主界面的暗环+发光麦克风样式不一致)、`p08-setting_91801`(底栏图标破损,非游戏手柄/礼物图标)、`p09-confirm_91901`(顶栏“待审批”文字重复重叠)。
- **主界面已知近似项(还原阶段处理)**:
  1. 84001 的房主金冠缺失,声波环套在了 1 号位——皇冠单独从更早批次(`main-room-8seats-v5_75002.png` 或 `main-room-starry-v3_84002.png`)切出复用,声波环单独切图后按权威“当前说话人”动态定位,均为独立组件,不依赖概念图上的位置示意。
  2. 参考 `concepts-selected/` 系列的通用近似项(乱码文字全部 DOM 渲染、头像框内头像不切、聊天区双气泡为 DOM 结构)同样适用于星空系列,见下文历史记录。

## 批准的完整页面效果(星空主题)

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `main-room-candidates/main-room-starry-v3_84001.png` | 主界面 768×1664:顶栏(返回+房名牌 / 在线胶囊+设置)、待审批胶囊、8 麦位上下两排各 4 个、聊天气泡列表、底栏(麦克风 / 输入框 / 游戏 / 礼物);月夜星空、湖面倒影、云海、飘带、金色花丝头像框 | `ad71cf6b6bd02d30b1bec9db64111edbf1eaf675a3537877dfd1da88640f7c65` |
| `popup-candidates/p02-games_91201.png` | 游戏列表弹窗 | `8b0b3308e85b10147462f48686f76d018e132a90cafdf6a4c27e9a2c6aef7e6a` |
| `popup-candidates/p03-invite_91302.png` | 邀请好友弹窗 | `cdea7fc91b977e5981eeeedd97fabd79acb28942674572da9db4641ee6c11099` |
| `popup-candidates/p04-requests_91402.png` | 上麦申请弹窗 | `e4a5e104710e46e329c7913af3365df5d586876c8f98af10b2e4aee5736deadf` |
| `popup-candidates/p05-member_91501.png` | 成员操作弹窗 | `ea23920c912dab1fbd82c608f483222fef572e06654fa88b0e80169aadfcb344` |
| `popup-candidates/p06-manage_91602.png` | 房间管理弹窗 | `7bdb51777171a3e32ed2c161aef2d5886488d98d6170e89ba9e4a4133fc3c766` |
| `popup-candidates/p07-members_91702.png` | 成员列表弹窗 | `3ccfc6634689abd770ba1def338183be2cc11736f880eac212d8e1705176c3e5` |
| `popup-candidates/p08-setting_91802.png` | 设置小弹窗(关联游戏) | `2625b2606ba52fb01397f4ba78e16f270b23d49c13072f9c99b968933887f46c` |
| `popup-candidates/p09-confirm_91902.png` | 确认弹窗(离开房间) | `5cef753a4a0e02dae35a125db8cea22487df02ee4ed77ca94df1cb559dc82bd6` |

辅助参考(不单独授权生产,仅供切图/布局/风格对照):

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `evidence/voice-room-redesign/before/01-room.png` | 线上现行主题参考(月夜湖面、丝带、花丝头像框) | 见 `evidence/voice-room-redesign/before/` |
| `wireframe-8seats-v2.png` | 主界面布局线框(聊天区填满、空位画麦克风图标) | `c7a2787dd8ec5f0f8f27407570e853499caad4de7166b731bf45cccbc90a360a` |
| `style-board-starry.png` | 星空风格板(取自线上截图,供弹窗批次统一取风格) | `4b859404ce5287a50f549f7bb3d2c9b5e003de00226bd224e1992a8fb9366c1e` |
| `main-room-candidates/main-room-starry-v3_84002.png` | 皇冠单独切图来源参考 | `29a7036e98235739ee9ca22ac958c5644c0f89070149923be689657118a4a33a` |

## 生成来源(星空主题)

- 工具同下文历史记录:云端 ComfyUI(RTX 4090),Qwen-Image-Edit-2511 + Lightning 4 步 LoRA,768×1664,脚本 `.tmp/comfy/comfy_qwen_edit.py`。
- 主界面 seed `84001`:以 `main-room-starry-v2_83001.png` 为 image1(定点精修基准),提示词只改皇冠位置、说话声波环位置、6 号位补为有人麦位、两个空位样式统一、右上角设置图标清晰化,其余构图/风格/配色/元素位置不变。
- 弹窗 8 张:image1 = 对应弹窗原概念图(`concepts-selected/` 61201–61902 系列),image2 = 已定稿的 `main-room-starry-v3_84001.png`(取背景风格),提示词要求保留原弹窗结构/按钮/信息层级,背景与配色换成星空主题。

## 下一步(还原流程)

按 `HANDOFF.md` 步骤 2–8:NumPy 按元素边界切组件 → Qwen-Image-Edit 去字补底板放大 2 倍(含单独切出的皇冠、声波环)→ 绿幕色键抠透明 + 清零全透明像素 RGB + 标九宫格 → 替换进 `VoiceRoomPage.tsx` / `VoiceAudioPanel.tsx` / `VoiceGameSheet.tsx` 对应样式(React 结构与逻辑不改)→ 派生按下/禁用态 → 逐屏叠图比对 → fixture 本地验收 → 用户在 Mac 上推送发布。

---

# 历史记录:语聊房“霓虹派对”改版(superseded)

> **状态(2026-09-11):superseded。**
> Studio Owner 看过选定的 75002 后反馈“整体氛围不够、要换风格方向”,原“乙 · 霓虹派对”
> 风格及本节全部批准结论**立即失效**。本节与全部候选图保留为 superseded 记录;
> `concepts-selected/` 下 8 张弹窗概念因风格随主界面统一,已在上文按星空主题重做并选优。

## 批准结论(已作废,superseded)

- **Concept ID**:`VOICE-ROOM-NEON-75002`(主界面)+ `VOICE-ROOM-NEON-POPUPS-6x`(8 张弹窗)
- **范围**:PWA 语聊房**房间内**的主界面与 8 个弹窗(游戏列表、邀请好友、上麦申请、成员操作、房间管理、成员列表、关联游戏小弹窗、确认弹窗)。**语聊大厅与创建房间不在本次范围**。仅授权本目录列出的资产族。
- **状态**:approved。风格“乙 · 霓虹派对”与 8 张弹窗概念由 Studio Owner 于 2026-09-11 会话中确认,并授权“自己验收,通过即按流程还原”;主界面按 Owner 指定的方案 2 流程(wireframe 定布局 + 51202 取风格,出图后按“恰好 8 个麦位、上下两排各 4 个、大小一致”验收)于 2026-09-11 通过计数验收后选定 seed 75002。
- **已否决 / 未选**:
  - `rejected/main-room-5seats-rejected.png`(4 版):只有 5 个麦位,照搬了 51202 布局,作废。
  - `main-room-candidates/main-room-8seats_71001/71002`:71001 房主画成整只狐狸坐游戏椅且布局 3/4/3;71002 多画第三排 3 个空位(共 11)。
  - `main-room-8seats-v2_72001/72002`:72002 又出现游戏椅;72001 多画第三排空位。
  - `main-room-8seats-v3_73001/73002`:仍多画第三排(线框 v1 麦位区与聊天区之间留白被模型用 51202 的空位排填充,据此重绘线框 v2)。
  - `main-room-8seats-v4_74001/74002`:通过 8 麦位 2×4 计数,但缺房主徽章、空位错挂黄色声波环;74002 保留作在线人数胶囊等组件的切图补充参考。
  - `main-room-8seats-v5_75001`:出现两个黄色声波环、7 号位图形损坏,未选。

## 批准的完整页面效果

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `main-room-candidates/main-room-8seats-v5_75002.png` | 主界面 768×1664:顶栏(返回+房名牌 / 在线胶囊+设置)、待审批胶囊、8 麦位上下两排各 4 个(1 号位房主金冠、3 号位说话黄色声波环、7/8 号位空位)、聊天气泡列表、底栏(麦克风 / 输入框 / 游戏 / 礼物) | `449934a9e87d495d6cfb95256bc663585cee975a86dba40d76273253df40ce95` |
| `concepts-selected/p02_games_61201.png` | 游戏列表弹窗 | `64c4cb8ea4b723bc73c5e5fedc622113ec3858d843b92c6037a7b8f95d1ed1b7` |
| `concepts-selected/p03_invite_61301.png` | 邀请好友弹窗 | `3b319e6eba55768c95674925507c2a20caeadf11532e848a3fb57cddbb88604f` |
| `concepts-selected/p04_requests_61402.png` | 上麦申请弹窗 | `9592ce5c09a5498057ec41db085cd6a20f3dcad189c65f456392991555199576` |
| `concepts-selected/p05_member_61502.png` | 成员操作弹窗 | `49973535842210a0daa688924c7b2e9266a94d8da393d030440c2cc0771782b6` |
| `concepts-selected/p06_manage_61602.png` | 房间管理弹窗 | `5c2dd3908571d02a3d3e710b02462578c378358211e600a6f89ed5954be53f9d` |
| `concepts-selected/p07_members_61701.png` | 成员列表弹窗 | `40b1fa4d308556dd66df312d54658b967f6c0b3a44dbea4190aab0a7698e6303` |
| `concepts-selected/p08_setting_61802.png` | 设置小弹窗(关联游戏) | `9c74e58b97e237a17ab2bd41ca62b6da8b12135881cb5c796fd16068c30add9f` |
| `concepts-selected/p09_confirm_61902.png` | 确认弹窗 | `b8b9389bdf185a608f2abd1836be4142e2718ea91dbe7994aa5fb2eabc342b3c` |

辅助参考(不单独授权生产,仅供切图/布局对照):

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `style-ref-yi_room_51202.png` | 风格基准“乙 · 霓虹派对” | `c51da9a574bfbade1db8b4a4d5e0611fbffa5e6579aca145c874e0a608c8e9b6` |
| `wireframe-8seats-v2.png` | 主界面布局线框(聊天区填满、空位画麦克风图标) | `c7a2787dd8ec5f0f8f27407570e853499caad4de7166b731bf45cccbc90a360a` |
| `main-room-candidates/main-room-8seats-v4_74002.png` | 在线人数胶囊等组件切图补充参考(同族同风格) | `0e8df4cc09592f4dd0578d358a83ab3c28d80720f50cf4375be42ec3166da186` |

## 生成来源

- 工具:云端 ComfyUI(RTX 4090),模型 `Qwen edit/qwen_image_edit_2511_fp8mixed.safetensors` + LoRA `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16`,文本编码 `qwen_2.5_vl_7b_fp8_scaled`,VAE `qwen_image_vae`;4 步、CFG 1、euler/simple,输出 768×1664(与 393×852 同比例)。脚本 `.tmp/comfy/comfy_qwen_edit.py`。
- 主界面 seed `75002`,参考图 image1 = `wireframe-8seats-v2.png`(定布局),image2 = `style-ref-yi_room_51202.png`(只取风格);提示词要点:严格按 image1 布局、禁止照搬 image2 的游戏椅与底部空位排、恰好 8 个圆形麦位上下两排各 4 个、6 有人 + 7/8 号空位(暗环 + 发光麦克风 + 点击上麦)、1 号位金色房主徽章、唯一黄色声波环在说话中的有人麦位、动物只露圆形头像。
- 弹窗 8 张为此前批次(seed 见文件名 61201–61902),同模型同风格。

## 已知近似项(Owner 授权流程内接受,还原阶段处理)

1. 概念图内所有按钮/名牌上的文字大多为乱码——**还原时文字一律由 DOM 动态渲染**,不进入切图。
2. 75002 的 5 号位头像成了扁平剪影——运行时头像本来就是用户自己的 emoji/照片,概念中头像仅为占位,不切头像内容,只切圆形头像框/圆环。
3. 75002 顶栏在线人数胶囊内部退化(灰块、无文字)——胶囊底板按 74002 同族样式切图,人数文字与小头像由 DOM 渲染。
4. 75002 的 8 号空位缺发光麦克风图标——麦克风图标从 7 号空位切出后两个空位复用同一张切图。
5. 聊天区个别行出现双气泡——聊天列表整体为 DOM 结构,概念仅定义气泡配色/圆角/头像尺寸。

## 下一步(还原流程)

按 `HANDOFF.md` 步骤 2–8:NumPy 按元素边界切组件 → Qwen-Image-Edit 去字补底板放大 2 倍 → 绿幕色键抠透明 + 清零全透明像素 RGB + 标九宫格 → 替换进 `VoiceRoomPage.tsx` / `VoiceAudioPanel.tsx` / `VoiceGameSheet.tsx` 对应样式(React 结构与逻辑不改)→ 派生按下/禁用态 → 逐屏叠图比对 → fixture 本地验收 → 用户在 Mac 上推送发布。
