# 语聊原稿恢复记录

2026-09-10：用户再次明确以 voice-v1 的 01-core-pages、02-invites-management、03-member-permission-states 为视觉基准。voice-v2 奶白绿色方案、voice-v3 夜景提案均不再作为实现目标。

本轮取消 voice-room-v2.css 的导入，改用 voice-reference.css，恢复云端街机头图、两排圆形麦位、麦位后关联卡、聊天区域、珊瑚色主操作、邀请与管理弹层；大厅恢复竖版房卡，创建页恢复全屏。创建请求仍不传 gameSlug。实际用户头像与状态来自接口，未增加示例成员、虚假说话光圈或已连接状态。

验证：Mac pnpm lint、pnpm build、git diff --check 通过，保留已有 middleware 弃用提示。本轮尚未完成受保护页面的同尺寸浏览器截图验收，不能认定全部场景一比一通过。麦克风权限与 RTC 生命周期仍需独立补齐；设计稿不能代替功能验证。
