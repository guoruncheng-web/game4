# Thirteen 晴光匹配页 v1 本地候选

2026-09-06：在已隔离的大厅候选工作树接入获批 R03 匹配页。仅供本地查看，未提交、推送或部署。入口 `http://localhost:3000/thirteen` → 快速匹配。

源码仓库：`/Users/mac/projects/cocos-game-studio/games/Thirteen`，基线 `a4064a5653be2e969250e9db3dc09fa921507cd9` 加当前 R02/R03 工作区改动。完整设计、资产和运行验收见该仓库 `docs/R03_SUNLIT_V1_ACCEPTANCE.md`。

宿主基线 `57f346bbfd6f651ff0f9b10ab3b4f5c82934b214`，候选分支 `codex/thirteen-lobby-sunlit-v3-20260905`。Thirteen 构建来自 `/Users/mac/projects/.codex-tmp/thirteen-r03-sunlit-v1-rc2/web-mobile`：625 文件，22,821,212 bytes，树 SHA-256 `20817e9d5e176c1e636602570edb8dac5cb0c16057fafe1895f650cf362134d6`。已与 `public/thirteen/game` 逐文件核对一致；旧候选备份 `/Users/mac/projects/.codex-tmp/thirteen-r03-sunlit-v1-host-before`。

Service Worker 升级 v62，Thirteen iframe 版本 `matching-sunlit-v1-rc2`。PWA 验收新增可选 `THIRTEEN_PWA_VERIFY_SUNLIT_MATCH=1`，在在线和离线状态进入实际 R03 并检查背景/取消按钮引用及缓存；没有注入匹配人数。

`pnpm lint`、`pnpm thirteen:test`、`pnpm build` 均通过。全新浏览器 PWA 与宿主入口验收 accepted=true，可信点击后音频 running；首次大厅 6,324 ms、热启动 2,727 ms。游客页面按实际状态显示登录提示，不能由这轮验收推断四账号真人匹配通过。证据在源码仓库 `evidence/visual/2026-09-06-r03-sunlit-v1/` 下 `host-*.log`、`host-result.json`、`pwa-result.json`、`pwa-match-*.png` 和 `build-tree.json`。

这是本地候选验收，用户最终画面复核、最低目标设备性能、提交与公开发布尚未进行；后续须按工作室发布手册执行，不能直接推送其他工作树的混合提交。
