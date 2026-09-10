# PWA / 语聊设计验收追踪

2026-09-10。参考 `design/pwa-v5/` 三张设计稿、`design/voice-v1/` 三张设计稿及 README 的协议修正。当前整体状态：未通过所有功能场景的一比一验收。

## 本次用户修订

创建页不再选择关联游戏；默认房名为“用户名 的语音房”，提交仅包含 title、visibility、requiresMicApproval。后端 normalizeGame 对缺省值返回 null；无关联游戏的卡片显示“一起聊天”。既有房间关联与房内活动管理保留。

本机 Mac `pnpm lint`、`pnpm build`、`git diff --check` 通过。构建存在已有 middleware → proxy 弃用提示。真实创建、返回 gameSlug 为 null、进入房间及手机布局仍待登录后验证。

## 场景清单与证据边界

| 设计场景 | 当前证据 / 下一验收项 |
| --- | --- |
| PWA 01 首页、03 消息、04 我的 | live/01-home、02-messages-empty、03-profile 为历史截图；需同尺寸重拍、检查卡片与导航 |
| PWA 02 语聊、08 语聊房、09 创建 | 采用 voice-v1 新稿及本次无游戏建房修订 |
| PWA 05 登录、06 注册、10 保存账号 | current-login 为本次复用 9335 Chrome 的截图；账号流程已改为 UID + 设置密码，不能照旧图恢复过期注册协议 |
| PWA 07 聊天 | 历史 live/25-chat-sent、27-chat-reply；需复核键盘与独立滚动 |
| PWA 11 改密、18 头像 | 历史 live/17-change-password、14-avatar、15-avatar-preview；需按当前状态重验 |
| PWA 12 离线、14 无权限 | 历史 live/20-offline-page、19-admin-no-access；截图不等于离线缓存验收 |
| PWA 13 管理 | 尚无本次管理员真实页面验收 |
| PWA 15 加载 | 需早期加载截图及成功/失败退出验证，不能只看最终游戏菜单 |
| PWA 16 捕鱼大厅、17 联机大厅 | 历史 live/38-fish-lobby、39-coop-lobby；双账号通过记录不等于全部布局通过 |
| Voice 01 大厅、03 创建 | 历史 live/04-voice-lobby、06-create-room；创建页旧截图已被本次修订取代 |
| Voice 02 房间 | 历史 live/07-room；当前组件尚未接 RTC，显示“语音尚未连接” |
| Voice 04 邀请、05 邀请好友 | 历史 live/05-voice-invitations、08-invite-friends；需覆盖提交禁用、过期与空列表 |
| Voice 06 审批、07 管理、08 成员操作 | 历史 live/10-mic-requests、09-management、33-member-actions；需复核普通成员入口、举报/屏蔽与确认流程 |
| Voice 09 麦克风权限 | 缺真实权限说明页及音频轨道生命周期，未通过 |
| Voice 10 离开 | 历史 live/12-leave-confirm；RTC 未接，不能宣称音轨清理通过 |
| Voice 11 连接异常 | 历史 live/35-room-network-lost 仅房间请求异常；尚未验证 RTC 单独断线和全网断线区别 |

## 浏览器

### 本轮复核：登录 / 注册

- 复用 9335 有窗口 Chrome，已实际查看登录、注册和验证码错误状态。注册时多次验证码校验失败，未创建账号；未修改数据库或绕过鉴权。
- 已修正：独立页面移除顶部登录/注册页签，切换入口移到主按钮下；删除重复注册宣传文案；验证码输入、图片、刷新按钮合成一行。UID 分配后设置密码的现行账号协议保留。
- 登录页 360×800、393×852、480×900、852×393 的 document scrollWidth 均等于 viewport width。对应截图为 `recheck-login-<width>x<height>.png`，原始尺寸记录在 `recheck-viewport-report.json`。横屏页面需纵向滚动，不等于键盘验收通过。
- `pnpm lint`、`pnpm build` 通过；依然保留已有 middleware 弃用提示。
- 尚有差异：头图不是原稿同一资产，输入框图标和密码显隐控件未补齐，注册表单因现行账号协议与旧稿不同。此轮不能标为一比一通过。
- 浏览器已回到登录页，等待测试账号登录后继续：首页、消息、我的、语聊全场景、管理页和 3D 游戏均未在本轮重验。

复用 Mac 有窗口 Chrome，CDP 9335，当前通过常驻 Node REPL 调用 CDP，无新增临时 `.mjs`。本次登录页 393×852，document scrollWidth 为 393。受保护页面等待用户在独立浏览器登录测试账号后继续。历史 webgl-scenes-report 中 canvas 数量不能单独证明 3D 正常渲染；仍需这个 WebGL 正常的 Chrome 重拍三款 3D 游戏与横竖屏。
