# 星空语聊房间

用户指定参考：frontend/bug/20260910-224505.png，2026-09-10。此参考替代此前 voice-v1 白色卡片房间方向。

视觉：满屏靛紫星空，低对比丝带与微光背景；上方两个大麦位，其余麦位四列；昵称白色，房主粉色与管理员蓝色并辅以文字；消息为紫色半透明气泡；底部输入、游戏列表、邀请和语音控制紧凑排列。真实业务人数决定麦位数量，默认 8 席，不添加截图中的假等级、假礼物、假活动或假成员。静态头像装饰不表征会员等级。

交互：空位可以申请上麦；已占位置延续管理权限；RTC 组件只移动和收紧样式，连接、授权、禁麦、重连与销毁逻辑不变。游戏列表仍以原 80dvh iframe 弹窗开启。

素材：使用内置 imagegen 生成 night-room.webp，源图保留 /home/gary/.codex/generated_images/01a08b0d-d209-7dc2-afc7-a0f2f5174c3e/exec-4a0449ed-4811-4474-98ea-5c6bbfd2dc20.png；项目文件 public/assets/game-box/voice-starry/night-room.webp。提示词：portrait 9:20 voice chat background only; deep indigo purple night sky, delicate small irregular stars, faint diagonal meteor trails, subdued lavender and dusty rose atmospheric glow, translucent silk ribbon right/bottom, quiet upper half, no UI/text/people/avatars/icons, palette #252746 #3c416f #675b85 #a6819d。生成后检查图像并压缩为 WebP，页面内再验可读性。

视觉验收使用显式本地 fixture 网关，不是生产账号或真实语音证据。真实 RTC 验收另按发布流程执行。iOS 系统状态栏与键盘需真机补验。

头像框使用内置 imagegen 生成 moon-frame.webp，原图 exec-99fc7d02-d33f-45e1-af45-5150980c48c5.png 位于上述同一生成目录。提示词：premium decorative avatar border; pearl-gold filigree, lavender ribbons, sapphire crescent, star jewels; transparent background and circular center; no face/person/text; center 76% width。检查 RGBA 中心透明，压缩为 384px WebP；不添加动画或会员等级含义。

本地验收：lint、Next webpack 生产构建、11 项部署分类测试与 actionlint 通过。393×852（safe-top=59）、320×640（safe-top=0）均 8 个实际麦位，无横向溢出；聊天区域与底栏不重叠。显式 fixture 中真实 React 输入发送、下麦释放席位、打开/关闭游戏列表、邀请弹层通过。截图与布局 JSON：evidence/voice-starry/。生产缓存 v87，固定后端 dd3a27da774a8e171da98532a1a6d33ef2294cb9 不变。本地视觉生产包使用 fixture 网关 17220，生产脚本独立重建并设置正式网关，fixture 服务与脚本均不入发布仓库。
