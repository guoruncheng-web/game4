# PWA “准备环境中”与顶部显示修复（v91）

## 为什么

用户反馈：第一次进入或点“有新版本可用 → 立即刷新”后要空白很久；首页切换底部 tab 后顶部右侧出现一块矩形；消息页的“消息”标题压在状态栏下面。

## 机制

- **准备页（批准概念 `PWA-PREPARE-31104`，见 `design/pwa-prepare/README.md`）**：`src/lib/pwa-version.ts` 的首屏脚本在 `<head>` 同步判断，只在首页 `/`、顶层窗口、支持 SW 且未准备过当前版本时给 `<html>` 加 `gb-preparing`，HTML 一到就显示，不等 JS。直接打开游戏页、房间链接等其他路由不显示，公网验收的游戏页首次接管时序不变。
- **首次安装**：SW 仍快速激活；首页 `PwaPrepare` 通知已激活的 SW（`gb-precache-start`）预缓存外壳，SW 逐项回报进度。6 秒后或断网时出现“先进入”，后台继续下载。
- **版本更新**：已有旧版本在跑时，新 SW 在 `install` 阶段就把外壳全部下好（带哈希的 `_next/static` 直接复用旧缓存），完成后才进入 waiting、弹“有新版本可用”。点“立即刷新”时先记下新版本号并显示“正在切换新版本”，接管后刷新即可秒进。
- **清单**：`pnpm build` 在 `next build` 后运行 `tools/pwa/build-precache-manifest.mjs`，生成 `public/pwa-precache.json`（不入库）= `.next/static` + `src` 实际引用的界面图片/图标。当前 88 个文件、17.9 MB；各游戏自己的大素材仍是玩到才缓存。准备完成写入 `/__gb-prepared-v91` 标记，并缓存首页 HTML，断网可从桌面图标进首页。
- **版本一致性**：`public/sw.js` 的 `VERSION`、`PWA_VERSION`、部署验收 `PWA_CACHE_VERSION` 必须相同，由 `test/pwa/pwa-version.test.mjs` 校验。

## 顶部修复

- 首页：右侧插画 `::after` 由硬切 `clip-path` 改为左/上边缘渐隐 mask，融入云朵头图，不再出现矩形边。
- 消息页：头图改为 `content-box` 并补 `padding-top: env(safe-area-inset-top)`，安全区用图集顶部同色 `#f6ecf2` 填满，下方图集位置不变。

## 本地验收（2026-09-11）

- lint、生产构建、24 项单元测试（含版本一致性）通过；`sw.js` 语法检查、`git diff --check` 通过。
- 隔离的全新 Chrome 环境（fixture 网关 17220 + 生产构建 3342，393×852、刘海 59px）：首页 133 ms 即显示准备页，本机 17.9 MB 约 2 s 完成并自动收起；缓存 static 68 / assets 20 / shell 5，完成标记、首页 HTML、准备页插画均在；再次打开不再出现；断网重进为首页而非离线页；非首页路由不显示；浏览器异常 0；消息页头部 padding-top 59px。证据：`evidence/pwa-prepare/first-visit.json` 与截图。
- 用户 Mac Chrome（经 /control 接管）：首次进入完成 v91；临时构建 v92 模拟更新，横幅在检查后 0.57 s 出现且此前 v92 三个缓存已填满；刷新后只剩 v92 缓存、SW v92 ready、不再准备。再改回 v91 反向更新，由 Claude 亲自点击“立即刷新”，1.33 s 回到首页，只剩 v91 缓存。切换过快，“正在切换新版本”过渡层未被截到（其作用是慢网兜底）。宽屏 1512×742 下插画居中渐隐。证据：`evidence/pwa-prepare/mac-chrome/`。

## 未验证 / 风险

- 真机 iOS 桌面 PWA 与慢速移动网络下的准备时长、进度动画，尚未实测；首次准备需下载约 18 MB。
- 本地使用 fixture 网关，无真实登录与后端。
