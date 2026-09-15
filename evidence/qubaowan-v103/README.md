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

## v103 首次公网发布失败与修正（Actions 34938427195）

- 失败步骤只有「Public brand, icons and offline home acceptance」；自动回滚成功，线上恢复 v102（`/sw.js` VERSION=v102，首页标题 GAME BOX），两个服务 active，失败候选 d495371 保留在服务器供诊断。
- 直接原因：门禁第一步等待 `serviceWorker.controller && game-box-prepared-version === "v103"`，即**整壳预缓存全部下完**，上限 180 秒。实测同一份清单（103 文件 / 19.36 MB，并发 6）：本机 Linux→公网 134 s（141 KB/s）、Mac→公网 158 s、GitHub runner→公网 >180 s 超时。候选清单为 102 文件 / 18.3 MB，比线上 v102 更小，**不是本次改动引入的性能回归**，是门禁预算低于真实跨地域耗时。
- `public-brand-independent` 的 `mode=login` 选择器超时是回滚造成的假象：其 `failure.png` 已是回滚后的 v102「GAME BOX」登录页并带「有新版本可用」横幅（home.png 06:54:00Z，服务器回滚 06:53:53Z）。选择器本身无缺陷，失败记录原样保留。
- 修正一（`public/sw.js`）：抽出 `cacheHome()`，在 `precacheAll` 的预缓存循环**开始前**先把 `/` 写入 shell 缓存，循环结束后按原逻辑再写一次更新副本与 `PREPARED_MARKER`。离线首页不再依赖 19 MB 整壳下完；导航仍为 network-first，联网时总拿最新。VERSION 保持 v103（该版本仅在线约 3.5 分钟后回滚，从未成为稳定生产版本；同版本字节变化由 SW 的 byte-diff 更新机制正常接管）。
- 修正二（`tools/pwa/brand-acceptance.mjs`）：第一步改为等待离线首页的**真实前置条件**——SW 已接管且 `/` 已在 shell 缓存（上限 120 s），记录 `homeCachedMs`；整壳预缓存进度改为只记录不设门（`report.precache`），真实链路耗时单独评估，不用放宽后的通过掩盖性能。
- 缓存顺序证明（`local-cache-order`）：首页 4332 ms 进 shell 缓存，整壳完成标记 4571 ms，领先量 239 ms —— 恰好等于本地整壳循环耗时；公网该循环为 134–158 s，领先量即为该值。
- 修正后本地复验（新 Chrome profile，候选生产构建，端口 3347）：`local-brand-swfix` passed，homeCachedMs 4140、首页 readyMs 4232、离线首页 online=false/controlled=true、无缓存 API 请求确实失败、运行异常 0；十三张 `swfix-thirteen` accepted，冷/温 8431/7608 ms，离线进入 R02Lobby，可信音频解锁；UMO `swfix-umo` accepted，首次/离线 2736/2738 ms；Social `swfix-social` accepted，首次/缓存/离线 3860/2252/2342 ms，异常与资源错误 0。lint 0 errors（5 项既有 warning），生产构建通过。
- 已知副作用：回滚执行了 `deploy/restore-backend.sh` 的 `bot-release-env.mjs .env disable` 分支，线上十三张机器人入口目前为关闭状态。该分支原为「回退到更旧的 v4 兼容后端」设计，本次后端修订未变（仍 0773aee）。按决定不单独恢复，下一次成功发布的 `nest-release.sh` 会重新 enable。
- 仍未覆盖：iOS/Android 真机已安装应用的名称与图标更新。
