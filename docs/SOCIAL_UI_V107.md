# 趣宝玩会玩样式对照（v107 候选）

个人 PWA：`guoruncheng-web/game4`，分支 `pwa/huiwan-ui-20261109`。
v106 首版为 `0fb075547730bda5bd7c97ffa240ca2a153750e8`；v107 继续按当前
会玩 Android 包校准。候选没有部署，线上仍为 v105。公司游戏、CDN、宿主和
后端均不在本次修改范围。

## 当前参考与实际覆盖

当前参考包来自[会玩应用宝官方应用页](https://a.app.qq.com/o/simple.jsp?pkgname=com.wepie.weplay)，
包名 `com.wepie.weplay`，versionName `5.26.31.2`，versionCode `10264`。
234,565,197 字节，ZIP CRC 通过，MD5 `02a7b7cd6d3a5d420d324af1d75732dd`，
SHA256 `da19b860b410f2baac55af96ad7709422e1c2d9918a2561360dd94893c58a3d3`。
官网旧渠道的 5.16.3.1 只保留为历史证据，未用它冒充当前版本。

REA 对原 APK 因大小写折叠后重名的资源路径拒绝分析。原包未改动；另建保留
逐文件原始字节、原路径和 SHA256 映射的资源子集，归一化副本库存成功，
Evidence 为 `ev_51e5b5905575fa0052a6b0def279a53a232a576f643b742c494f18d97c33e651`。
这是资源库存证据，不是 REA 反编译出业务 Java。

独立便携 JADX 1.5.6 解码出当前包 4,096 个布局 XML；对精确提取的 DEX
单独导出了 `com.secneo.apkwrapper.AW` 加载器。公开的 8 个 DEX 虽有 65,227
个类，但 Manifest 声明的 463 个业务 Activity 均不在其中；页面控制器尚未恢复。
第一次完整 DEX 分析的内存失败日志保留，没有将其记作成功。

Mac 上已建立隔离 API30 ARM64 模拟器 `emulator-5580`，当前官方 App 已安装、
启动并显示真实登录界面。标准隐私流程、微信入口、其他登录方式、手机号登录
和帮助菜单已有实际截图。尚无登录后的首页、派对、私聊和房间截图，因此
**本候选不能标为完整复刻或像素级验收完成**。

原始 APK、资源、REA 输出、解码记录、模拟器和 App 截图保留在 Mac：
`/Users/mac/projects/pwa-games/huiwan-reference-20261109/`。
第三方安装包、完整资源和账号信息不提交到 PWA 仓库。

## 已实现的对照

- 五栏导航：52px 高、34px 图、10px 标签；使用当前包的选中/未选中图。
- 首页账户区：48px 头像、16px 昵称、22px 余额；五项快捷入口为 80px 行。
- 派对列表：单列 80px 房间行、56px 封面；保留真实房间可见性和成员数据。
- 消息：44px 标题区、72px 会话行、48px 列表头像；加号打开已有好友搜索。
- 私聊：40px 圆头像、16px 正文与原生布局对应的气泡内边距。
- 我的：68px 头像、18px 姓名、14px UID；普通菜单行 52px/16px，组间 12px。
- 登录：白页、中心趣宝玩标识、48px 胶囊字段、44px 绿色按钮。保留 UID/密码、
  验证码和注册关闭；不添加无法使用的手机号或微信登录。
- 创建房间：完整白页，顶部取消/标题/确定，44px 名称字段和 8px 圆角；
  原有 40 字限制、可见性和上麦审批字段保留。
- 成员与邀请：10px 顶角、可关闭把手、16px 标题；房间底栏压至 48px，
  圆控件视觉 30px、触控区 44px。32px 输入框仍可直接发送 PWA 房间消息。

XML 中自定义字号按 CSS 逻辑像素适配，不宣称已在真机测得同一物理尺寸。
具体依据和剩余差异见 `design/social-v107/UI_PARITY.md`。

## 素材来源

v106 的游戏插画由 imagegen 生成，源图和提示词仍在 `design/social-v106/`，
运行素材为 `public/assets/social/*-v1.webp`。

v107 的十个导航状态图与个人页背景来自当前官方 APK，不标为原创；原资源
路径和文件 SHA256 记录在 `design/social-v107/reference-assets.json`。
趣宝玩自己的名称、账号协议和真实功能保留；发现页仍为 PWA 游戏分类，
不冒充会玩的动态广场，不添加无后端的商城、充值、VIP 等入口。

## 复验

复用既有依赖，没有安装 node_modules，也没有修改共享依赖。缺失的 Agora
复用此前已有部署的同版补丁副本；过程证据保留在 v106 验收记录。

```sh
pnpm lint
BACKEND_GATEWAY_URL=http://127.0.0.1:3202 pnpm build
node --test test/pwa/pwa-version.test.mjs
node tools/pwa/nightclub-fixture.mjs
BACKEND_GATEWAY_URL=http://127.0.0.1:3202 PORT=3201 pnpm start
node tools/pwa/huiwan-ui-acceptance.mjs http://127.0.0.1:3201 evidence/social-v107/browser
PWA_CACHE_VERSION=v107 node tools/pwa/huiwan-offline-acceptance.mjs http://127.0.0.1:3201 evidence/social-v107/offline
```

Next rewrites 的网关地址在构建时确定，不能只在启动时指定。一次默认 7100
构建导致登录夹具未收到请求；失败记录保留，随后使用 3202 重新构建复验。
生产构建继续由既有发布流程注入实际目标地址。

结果入口：`evidence/social-v107/VALIDATION.json`、`browser/result.json` 和
`offline/result.json`。这些测试只使用 loopback API 夹具；钱包为合成事件，
未执行真实登录、改密、RTC 或生产数据写入，不代替双端语音和游戏玩法验收。
