# PWA 账号与语聊页面发布

基线 frontend：d45a7fd70427cd85c6c640d16675589b3c45841e。
后端固定版本：7fa2523361af748fda43425239114d3ebbce0f52。在线上版本基础上补 UID 登录支持，保留 username 登录、验证码、封禁及票据约束，并加入公网 UID 登录验收。
缓存版本：v82。游戏构建树不变；保留线上 webpack 构建及 Agora 部署配置。

包含账号注册/登录/首次设密和改密新版、PWA 页面样式、voice-v1 语聊大厅/创建/房间/邀请/管理入口。创建房间不绑定游戏。房内游戏列表按服务端上架状态筛选，以独立 iframe 在 80dvh 弹窗运行，关闭卸载 iframe，外层房间保持挂载。嵌入页面不重复弹 PWA 更新提示。

本地验收：隔离候选 lint、webpack 生产构建通过。Mac 可见 Chrome，正常验证码注册、设置密码、创建房间、加载游戏列表成功；Star Runner 与 UMO 实际画面见 evidence/voice-release。393×852 下弹窗高度 681.59375px；关闭后 iframe 消失、房间仍在。API 未 mock；本地 3336 候选复用 3000 后端，测试请求 Origin 使用该后端允许的 localhost:3000。

边界：RTC 音频与麦克风权限尚未实现，页面如实显示语音尚未连接。本次不宣称全部 voice-v1 场景一比一通过，也不宣称全部游戏弹窗、移动真机、键盘、地区、语音生命周期已验收。既有 Next middleware 弃用警告保留。公网 PWA/协议/音频/离线由发布 workflow 验收，最终状态以 Actions 为准。

后端 lint、19 项单元测试、五服务构建通过。本机集成测试因缺少 @embedded-postgres/darwin-arm64 二进制在启动阶段退出，未将其记为通过。首次 Actions 34469068226 在服务切换前取消（switch skipped），未部署不兼容的前后端组合；追加后端固定修订后重新发布。

回滚：workflow 切换前保存旧源码、构建、依赖和配置至 /srv/gameai/.backend/rollback/<本次frontend SHA>，游戏树未替换。失败自动执行 nest-rollback.sh；手动执行 bash /srv/gameai/.releases/<本次frontend SHA>/deploy/nest-rollback.sh <本次frontend SHA>，再 revert 本次提交，按 deploy/README.md 复核。不得恢复旧数据库或覆盖密钥。
