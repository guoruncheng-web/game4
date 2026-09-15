# 趣宝玩 v103 发布候选验收

- 隔离候选基线：c36c333ff33d756e7da543685805ccaa3da2db72（最近成功 Actions 34838454616）。
- 原品牌实现：a7f933a1516e7c488d7407399f92dc2935b7b70c。
- 后端保持：0773aee8070261b1bdf89ff3a6c9ab6710ab41f4；游戏静态构建树、账号和规则不变。
- SW、客户端准备常量、Actions 断言统一 v103。
- 生产构建与 lint 通过；保留既有 middleware 弃用提示与 5 项既有 lint warning（0 errors）。部署/PWA 测试 26 项通过。
- 本地新 Chrome profile：十三张首次/缓存 11115/7497ms，音频与离线进入 R02Lobby 通过；UMO 首次/缓存/离线 5700/2790/2687ms，音频通过；Social 首次/缓存/离线 4140/2348/2347ms，手牌、玩法、结算、音频和离线通过。
- 品牌验收检查安装清单、Apple 名称、各图标远端字节与本地 SHA256 一致、393px 首页/登录/注册截图、SW 缓存图标和离线首页。最终版本替换安装提示中遗漏的旧图标。
- `local-brand`、`local-brand-retry` 为离线探针失败记录：文档重载后 navigator.onLine 未按旧调用保持离线。修正为同时附加 SW target 的网络模拟、在新文档设置网络状态，并断言无缓存 API 请求必须失败。`local-brand-verified` 和 `local-brand-final` 为修正后记录；失败记录不冒充成功。
- 新增公网品牌验收步骤，失败使用现有自动回滚；全套专项由既有累计 diff 分类器选择。
- 不包含 iOS/Android 真机已安装应用更新测试。公网验收与最终 Actions 状态另行记录。
