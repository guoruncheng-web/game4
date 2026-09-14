# Thirteen Social 试玩构建 v93

2026-09-14。用户要求部署当前 Creator 版本；沿用 `/thirteen-social` 与语聊房游戏入口。

- 游戏源码：`guoruncheng-web/thirteen-social@c2d56a560bc0eba0c3e2321d8df91d3b4b906c6f`。
- 后端固定修订为 `c69ad31d6cfb2088caffc59b02074d0595b058e1`（仅同步语聊弹层遮罩关闭的浏览器验收脚本）；没有后端协议或真实钱包变更。
- Creator 3.8.8 release/web-mobile，Loading 场景 `175ec702-cf44-4f91-b334-591661af0c73`。
- 游戏构建 769 文件 / 32,156,369 字节；逐文件 JSON 清单的 SHA-256：`b32fc095c25d9c024d531934333ad4cedd3e3cffb993ef0a982fa1d2fda1dc7a`。清单见私有游戏仓库 `evidence/release-pwa-v93/build-tree.json`。
- PWA SW、首屏版本常量、Actions 验收版本统一 v93。静态目录精确替换，不保留旧哈希产物。

包含六档模拟兑换、入座检查、单席添加机器人、独立对局计分与结算弹窗、返回准备页，以及对局页恢复 Logo/设置与水平场次背景。保持本地试玩和模拟余额标识，不把离线状态或试玩钱包当作平台权威资产。

本地前端 lint、production build、PWA 版本测试通过。全新 Chrome profile 单次首次导航：首次准备页 4,907ms，缓存 2,955ms，离线 3,147ms；可信点击 AudioContext running、音效触发、准备→兑换→机器人→对局→结算→返回，以及离线重新开局均通过，游戏异常及缺失资源为 0。这些是代表主机结果，不等于真机或公网性能通过。

发布前远端基线 `002ddde6691fd136ee5237ea69eb81cc03f9ad94`；旧游戏树位于工作室 `releases/backups/thirteen-social-before-v93`。Actions 根据实际生产到候选累计差异选择验收，失败自动恢复旧生产。需要手动回滚时 revert 本次 frontend 发布提交并推进缓存版本，遵循 deploy/README.md；保留生产状态、密钥和独立后端固定修订。

## v94 独立复验候选

首次发布 c912f90 / Actions 34812539995 在旧十三张大厅冷启动 180 秒超时后自动回滚。同一时段 Mac 另开 Social 首次下载，30 秒及 120 秒诊断均未进入准备页；保留私有游戏仓库 public-pwa、public-diagnostic、actions-failed 证据，不记为通过。

本次不改游戏产物，缓存升级 v94 以隔离失败候选缓存；按顺序等待 Actions 全部结束，再执行 Social 全新 profile 公网验收，避免多个冷启动验收同时下载。性能门槛不变，本次结果独立记录。
