# 星空语聊房间

用户指定参考：frontend/bug/20260910-224505.png，2026-09-10。此参考替代此前 voice-v1 白色卡片房间方向。

视觉：满屏靛紫星空，低对比丝带与微光背景；上方两个大麦位，其余麦位四列；昵称白色，房主粉色与管理员蓝色并辅以文字；消息为紫色半透明气泡；底部输入、游戏列表、邀请和语音控制紧凑排列。真实业务人数决定麦位数量，默认 8 席，不添加截图中的假等级、假礼物、假活动或假成员。静态头像装饰不表征会员等级。

交互：空位可以申请上麦；已占位置延续管理权限；RTC 组件只移动和收紧样式，连接、授权、禁麦、重连与销毁逻辑不变。游戏列表仍以原 80dvh iframe 弹窗开启。

素材：使用内置 imagegen 生成 night-room.webp，源图保留 /home/gary/.codex/generated_images/01a08b0d-d209-7dc2-afc7-a0f2f5174c3e/exec-4a0449ed-4811-4474-98ea-5c6bbfd2dc20.png；项目文件 public/assets/game-box/voice-starry/night-room.webp。提示词：portrait 9:20 voice chat background only; deep indigo purple night sky, delicate small irregular stars, faint diagonal meteor trails, subdued lavender and dusty rose atmospheric glow, translucent silk ribbon right/bottom, quiet upper half, no UI/text/people/avatars/icons, palette #252746 #3c416f #675b85 #a6819d。生成后检查图像并压缩为 WebP，页面内再验可读性。

视觉验收使用显式本地 fixture 网关，不是生产账号或真实语音证据。真实 RTC 验收另按发布流程执行。iOS 系统状态栏与键盘需真机补验。

头像框使用内置 imagegen 生成 moon-frame.webp，原图 exec-99fc7d02-d33f-45e1-af45-5150980c48c5.png 位于上述同一生成目录。提示词：premium decorative avatar border; pearl-gold filigree, lavender ribbons, sapphire crescent, star jewels; transparent background and circular center; no face/person/text; center 76% width。检查 RGBA 中心透明，压缩为 384px WebP；不添加动画或会员等级含义。

本地验收：lint、Next webpack 生产构建、11 项部署分类测试与 actionlint 通过。393×852（safe-top=59）、320×640（safe-top=0）均 8 个实际麦位，无横向溢出；聊天区域与底栏不重叠。显式 fixture 中真实 React 输入发送、下麦释放席位、打开/关闭游戏列表、邀请弹层通过。截图与布局 JSON：evidence/voice-starry/。生产缓存 v87，固定后端 dd3a27da774a8e171da98532a1a6d33ef2294cb9 不变。本地视觉生产包使用 fixture 网关 17220，生产脚本独立重建并设置正式网关，fixture 服务与脚本均不入发布仓库。

房间生产提交 00f1c7a2d34ee03af71eeef27c7ca665a3fe8bfe，Actions 34492718600 成功：https://github.com/guoruncheng-web/game4/actions/runs/34492718600 。13 项公网 RTC 验收通过、browserErrors=[]；包括听众加入不采集、双向音频、游戏弹窗内持续语音、管理员禁麦、Token 续期、三次断网恢复、关房清理。按需计划正确仅选择基础鉴权与 RTC，未跑游戏长测。证据位于 evidence/voice-starry/production-v87。Linux runner 截图缺少部分中文字体；本地 Mac 图中文字正常，未将 runner 字形截图当作 iOS 视觉证据。

## 麦位交互与说话声波（2026-09-10）

按房主要求：去掉“上麦/下麦/加入语音”文字按钮。进房自动以听众身份连接声网（不采集麦克风）；点击空麦位即申请该麦位（后端 `mic-request` 新增可选 `seat`，直接上麦时优先该位，被抢占则退回最小空位；需审批的成员审批后仍分配最小空位）；在麦时点击非按钮/输入框区域弹出“确认下麦？”，申请中则弹出“取消上麦申请？”。输入框左侧仅保留麦克风开关图标（与输入框垂直居中）；播放被浏览器拦截时才出现“恢复房间声音”图标。房主/管理员的待审批入口改为状态行右侧“待审批 N”。

说话声波 `vfx.voice.speaking`（`docs/voice-speaking-vfx.json`，校验通过）：每 200ms 采样已授权本地发布音轨或已订阅远端音轨的 `getVolumeLevel()`，>0.06 视为说话并保留 700ms；徽标位于麦位头像右下角，仅 transform 动画，`prefers-reduced-motion` 下静止；关麦、下麦、失去麦位、断线或卸载即清除。其他成员依据各自收到的远端音轨看到同一标识。

本地验收（fixture 网关 17220 + 生产构建 3342，无真实 RTC）：lint、生产构建、22 项前端单测（含声波采样两项）通过；393×852 与 320×640 无横向溢出，麦克风图标与输入框中心差 0px；点 3 号空麦位请求体为 `{action:'request',seat:3}` 并落在 3 号；空白处弹窗“继续上麦”保留、“确认下麦”释放；未在麦时点击空白不弹窗；减少动态效果下声波动画为 none；浏览器错误 0。截图与 `interaction.json` 在 `evidence/voice-controls/`（声波徽标为注入的纯视觉探针）。真实双端声波可见性由后端 `rtc-browser-test.mjs` 新增检查在公网验收。
