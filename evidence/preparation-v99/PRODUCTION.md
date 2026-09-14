# Preparation compact layout / PWA v99 production

已于2026-09-14成功发布。线上 https://www.gameai.xingzdh.com/thirteen-social 。

- frontend运行修订：bae9c09ad1254d5e38dfebd404cebd92e07869e6，PWA v99。
- 游戏源修订：0c37eeb43b8f093e0cf1f3ca252f6a9f141fdd9d。
- backend固定修订未变：0773aee8070261b1bdf89ff3a6c9ab6710ab41f4。
- Actions34828982274：https://github.com/guoruncheng-web/game4/actions/runs/34828982274 ，所有选定步骤成功，临时账号清理成功，未执行回滚。

准备页在496逻辑高度下保持scale=1，恢复780高度后位置正确；兑换、入座、机器人对局、牌面、结算返回、可信音频、缓存及离线均通过。公网首屏28062ms，缓存3859ms，离线2601ms；30秒首屏预算通过，无性能豁免。运行异常与资源错误均为0。线上主脚本SHA256为490d41360f1c505debab9e680802ee1d51ec7e1dfe7ddb3ead633b661dc79040，与候选一致；SW实读v99。仍未覆盖最低目标真机及所有地区，28秒首屏仍有改善空间；未选旧十三张/UMO/RTC专项不计作本次通过。

优化包括WebP替代图及PNG回退、480条图像/音效元数据打包、取消Loading里随切场被丢弃的音效加载。首屏JSON请求从130降到11。Chrome验收启动增加诊断与切换前预检；诊断等待180秒但最终性能预算保持30秒。

v96、v97、v98失败及自动回滚证据均保留；不得将失败尝试写成通过。v98独立诊断跨越回滚后的404/500不属于稳定候选功能结论。此前生产为v95/frontend95ab10b0027a332593507346ae575a5da01e2335；回滚仍走发布手册，保留数据库/状态/后端配置。

完整证据在frontend发布worktree releases/preparation-pwa-v96/evidence/preparation-v99/public-actions/；源码构建、布局与优化证据在游戏worktree releases/preparation-compact-layout/evidence/。普通games/thirteen-social工作区仍有未完成音频/动效工作，不得混入本发布。
