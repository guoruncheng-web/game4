# 个人 PWA 临时内测登录

公开页面仅提供 UID / 用户名和密码登录，测试账号由 Owner 私下发放。默认准备 4 个普通测试账号，以便验证四人对局。账号密码不写入 Git 仓库、网页源码或发布证据。

注册入口默认隐藏，旧的 `mode=register` 地址也进入登录页。个人 Nest 后端同步默认拒绝 `POST /api/auth/register`，返回 403 / `registration_closed`。登录错误达到阈值后仍要求验证码。

恢复注册须同时在个人后端设置 `PWA_PUBLIC_REGISTRATION_ENABLED=1`，并在前端构建时设置 `NEXT_PUBLIC_PWA_REGISTRATION_ENABLED=1`。前端开关不能绕过后端限制。

本改动基于个人 PWA 当前主分支，独立于游戏仓库拆分分支。源码仅提交至 `guoruncheng-web/game4` 与 `guoruncheng-web/game-studio-backend`。发布目标是迁移后的 `game.livegrc.chat` / `43.139.80.246`；现有 GitHub 自动部署仍指向旧服务器，不通过合并 main 来触发旧流程。

配套后端提交固定为 `61b412b5f491bccc7a8e867b983df4737484721a`，评审：https://github.com/guoruncheng-web/game-studio-backend/pull/1。PWA 缓存版本提升为 v104。
