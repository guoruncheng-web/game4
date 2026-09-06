# Thirteen 晴光大厅 / 匹配页 v62 发布

2026-09-06 项目所有者在本地候选交付后明确要求“部署”，授权本提交上线。发布提交身份为本文件所在 Git 提交；Actions 与公网最终结果在 Thirteen 源码仓库 `docs/SUNLIT_RELEASE_2026-09-06.md` 及 `evidence/release/2026-09-06-sunlit-v62/` 记录，避免仅更新事后证据反复触发生产部署。

源码提交：`bc5ec2e807c84dfd65274950b30ec6bb58dc0572`（`guoruncheng-web/Thirteen`，`feat/modern-doudizhu-ui`）。大厅与匹配页更换为已批准夕阳露台风格、独立按钮切片和可编辑状态；人数消费既有权威协议，匿名玩家不伪造人物资料。

Creator 3.8.8 web-mobile release，启动场景 `5066c4ee-d702-4879-8ddb-a69b5836eb08`。最终 Cocos 构建 625 文件、22,821,212 bytes，树 SHA-256 `20817e9d5e176c1e636602570edb8dac5cb0c16057fafe1895f650cf362134d6`；宿主 `public/thirteen/game` 逐文件一致。PWA 缓存 v62 与 iframe `matching-sunlit-v1-rc2` 同步发布。

本地门禁：源码严格检查、138/138 测试、独立 release 运行、四视口、状态与取消/返回/私人房恢复、按钮反馈清理；宿主 lint、production build、协议、PWA 全新 profile 在线/缓存/离线与可信音频均通过。大厅首次 6,324 ms，热启动 2,727 ms。证据 `evidence/visual/2026-09-06-r03-sunlit-v1/`。最低真机及公网性能不能由这些本地结果替代。

发布前 game4 HEAD：`57f346bbfd6f651ff0f9b10ab3b4f5c82934b214`。旧本地候选树 `/Users/mac/projects/.codex-tmp/thirteen-r03-sunlit-v1-host-before`。回滚：revert 本发布提交（Cocos 树、缓存/测试版本、iframe 同一单元），推送 main 让同一 workflow 部署并重启 Next/WebSocket；随后复验首页、Thirteen、`/ws/health`、PWA 版本、启动、音频、缓存和离线。不得 reset 混合主分支。
