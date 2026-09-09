# GAME BOX 容器视觉规范

## 当前方向：天空街机世界（v3）

- **游戏世界而非 H5**：PWA 宿主是一座可探索的天空街机世界；游戏入口表现为路径上的建筑和传送门，不使用内容流式白卡片墙。
- **实体化界面**：品牌、主操作、消息和导航使用木牌、石台、卷轴与玩具控制台的材质语法，同时保留真实 HTML 语义和动态数据。
- **两秒读懂**：中央“继续冒险”传送门是第一焦点；世界路径是第二焦点；账号、资源和声音属于紧凑 HUD。
- **同世界分区**：消息页是冒险者邮局，个人页是玩家小屋，聊天详情是通讯塔；功能不因视觉改造而改变。

## 形状与层级

- 安全与友好使用圆角、叶片和云朵；稳定结构使用石台和木牌；主操作使用带按压深度的绿色实体按钮。
- 当前 Tab 同时使用抬升、绿色照明和文字，不能只依赖颜色。
- 顶部安全区属于天空世界，`html`、`body`、manifest 与 route theme color 均使用 `#62c9ee`。

## 色彩角色

- 世界天空：`#62c9ee`
- 主交互 / 在线：`#38c95b`
- 奖励 / 路径：`#ffd84d`
- 木质结构：`#9b5c2f`
- 危险 / 未读：`#ef5350`
- 文字 / 描边：`#173366`

## v3 概念批准记录

- Studio Owner 于 2026-09-09 对 `public/concepts/game-box-game-native-hub-concept-v3.png` 回复“可以的这个游戏”，随后明确要求“弄完直接按照这个设计稿还原了”，授权 PWA 宿主还原；范围不包含任何游戏内部内容。
- 大厅 SHA-256：`75b7e1abb6bc7e8c7d442a32a9b6e120dc78f521f8d38f8c4b32188af5f2aee5`
- 同方向完整宿主场景：`game-box-game-native-messages-concept-v3.png`、`game-box-game-native-profile-concept-v3.png`、`game-box-game-native-chat-concept-v3.png`。
- 旧的明亮白卡片 v2 与 v1 只保留为迭代记录，不再作为生产视觉基准。

## 生成资产记录

- `public/assets/game-box/sky-world-bg-v1.png`：所有宿主页签共用的无 UI 天空世界背景，内置 imagegen 生成；不含文字、按钮、角色或游戏入口，运行时动态内容由 HTML 覆盖。
- 背景 SHA-256：`ff31b3ba20cfb0b18d04863127025609217e4146f1c504b752795bc809363a3b`。

## v3 一比一生产资产与动态分层

- 注册页唯一批准基准：`public/concepts/game-box-auth-gate-concept-v1.png`，SHA-256 `e8b959f3732d5708780c6918c7825f2d3f373b1d32c373c46d5c0016a5eb92ce`。运行时使用同尺寸 WebP 生产副本并关闭 Next 图片重编码；验证码与输入内容独立覆盖。
- 登录页同构生产图：`public/assets/game-box/v3/game-box-auth-login-concept-v1.png`，SHA-256 `80236d41b26fa065146d8048a92fed2827935ef1111af86d2f9b307e77de41eb`；不包含用户名、密码或其他动态值。
- 消息 clean 图：`game-box-messages-background-clean-v4.png`，SHA-256 `17e800b01ad56eee93302dbbba8aa453acc6ae15d4a078bd98cbf82ec34ea909`；保留邮局、望远镜、四个玩家木座和空消息牌。
- 聊天 clean 图：`game-box-chat-background-clean-v3.png`，SHA-256 `76e6530b12722fee9ff33f792581d152a97653d24f7015505cd33c40fbbc7c6d`；保留五个空羊皮气泡与通讯台。
- 个人 clean 图：`game-box-profile-background-clean-v3.png`，SHA-256 `067690e06f84d58fd46457fb994dde080f5e47e58947b97b9ab28e1fc255c4b0`；头像、用户名、UID 和三项统计槽位均为空。
- 硬门禁：头像、等级/身份文案、货币、UID、统计、好友名、消息、未读数、验证码、输入内容不得烘焙到整页生产底图。固定标题、建筑牌匾和导航文案可以属于批准美术。
- 批准 PNG 作为母版/像素验收基准；上线页使用 quality 94、同分辨率 WebP，将单页 1.9–2.6 MB 降至 312–493 KB，解决公网首次进入在大图下载期只见天空底色的 P0 问题。

## PWA 图标资产记录

- `public/icons/pwa-icon-master-v2.png`：PWA 图标母版；深海军蓝圆角底、荧光绿立体手柄，主体位于中央 maskable 安全区。由内置 imagegen 生成。
- `public/icons/icon-192.png`、`icon-512.png`：Web App Manifest 常规图标，由母版缩放生成。
- `public/icons/maskable-512.png`：Android 自适应裁切图标，母版的中心构图可承受圆形、水滴形裁切。
- `public/icons/apple-touch-icon.png`：iOS 主屏幕图标，由不透明母版缩放生成。
