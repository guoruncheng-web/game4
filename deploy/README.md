# NestJS production deployment (2026-09-07)

The PWA repository remains `guoruncheng-web/game4`. Backend source is the independent private repository `guoruncheng-web/game-studio-backend`; `backend-revision.txt` pins its exact commit. A read-only repository deploy key is stored as `BACKEND_READ_KEY` in game4 Actions. Existing `DEPLOY_SSH_KEY` remains exclusively in Actions.

Production: Nginx → Next 7010 for pages, → Nest gateway 7011 for `/ws`; Next rewrites `/api/*` to that same gateway. Platform 7101, Thirteen 7102 and legacy 7103 bind only 127.0.0.1 and require per-service gateway signatures. Only login/register/captcha bootstrap routes are public. Legacy contains existing UMO, fish and invite services; new games must have their own Nest app.

The deploy account can only restart existing `gameai` / `gameai-ws` systemd units. The latter therefore launches a generated compatibility entrypoint under `/srv/gameai/server/` which imports `.backend/current/tools/start-all.mjs` through `deploy/systemd-bootstrap.mjs`. This supervisor starts four independent Nest processes and fails the entire group if one exits. These generated entrypoints have no business logic. The checked-in historical systemd/nginx files describe the existing units, not a command to install new units.

Frontend lives in `/srv/gameai`; backend immutable revisions in `/srv/gameai/.backend/releases/<sha>` with `.backend/current` symlink. Database/AUTH_SECRET/per-service keys belong to `.backend/.env` (0600); the frontend `.env.local` has no database or signing keys. Existing PostgreSQL on 127.0.0.1:5433 and encrypted `.state/{thirteen,umo}` remain in place with original keys.

Actions validates and builds backend, stages frontend `.releases/<sha>`, builds it while the old site serves traffic, then saves prior source, build, dependencies and frontend environment under `.backend/rollback/<frontend-sha>`. Both services restart during cutover, so existing sockets reconnect. Rsync explicitly excludes `.backend`, `.releases`, `.state` and runtime secrets. Build/switch errors restore the previous files automatically; public acceptance failures run `nest-rollback.sh`. Temporary acceptance accounts are deleted in an always-run cleanup. Evidence contains no credentials.

Each cutover also saves `.backend/frontend.current` as `frontend.previous`; rollback archives the failed marker and restores that previous SHA so the next storage-reclamation pass still knows which immutable release is live. For installations affected by the older rollback behavior, reclamation may recover a missing marker only when the deployed source has exactly one checksum-identical `.releases/<sha>` match after excluding build, dependency, private/state and generated server paths. Zero or multiple matches remain a hard failure.

To release backend changes, push its private commit first, update `backend-revision.txt`, verify local integrated acceptance and remote main HEAD, then push the frontend candidate. Future games get independent apps/ports/keys and extend the gateway registry. To rollback the current successful release, execute `bash /srv/gameai/.releases/<frontend-sha>/deploy/nest-rollback.sh <frontend-sha>` via the existing Actions SSH channel. Revert the frontend release commit before the next normal deployment so the pinned source also reflects rollback. State files and the account database are never restored from stale backups.

## Thirteen bots v70 compatibility boundary

`thirteen-bots.enabled` enables quick/private bot entry points through `bot-release-env.mjs`; only those two production env keys change. v4 room snapshots are forward-only relative to v69. For a bot-capable release, `backend.compatible` records the compatible backend in the rollback directory. Automatic/manual rollback restores the previous frontend but retains that compatible backend with both bot entry points disabled, allowing active rooms to finish. It does **not** downgrade the backend binary or restore stale room/database data. Backend failures require a compatible forward fix. The old frontend does not advertise bots and uses human-only rooms.

Actions additionally verifies real authenticated browser bot management, human replacement, 15-second matching, full mixed games, reconnect/rematch/history and v70 PWA offline/audio. The existing cross-region cold-start performance exception remains a recorded risk, not a performance pass.

## 按改动范围验收（2026-09-10）

`acceptance-plan.mjs` 比较服务器真实的 `frontend.current` 和 `.backend/current` 与两个候选 HEAD，保存完整路径列表、基线和选择理由到 `acceptance-plan.json`。不能使用 HEAD 的父提交作为生产基线，否则失败/取消发布后的累积改动会漏测。切换前再次检查两份生产 SHA；变化时终止当前候选。

- 仅文档、设计稿和证据变化：不构建、不切换。
- 语聊页面、RTC SDK 的纯新增依赖、voice Nest 服务变化：基础鉴权/健康 + 双端 RTC。
- 十三张资源/规则/宿主变化：基础检查 + 十三张四人开场、机器人和 PWA。
- UMO 资源/宿主变化：基础检查 + UMO PWA。
- SW 行为或公共布局变化：增加两个游戏的 PWA 检查；只有缓存版本数字变化，不额外触发无关游戏长测，版本仍由公网 smoke 核对。
- 账号/网关、已有框架依赖及解析变化、未知运行文件或无法解析的历史基线：全套。新增 SDK 的锁文件只有在既有包/快照与 importer 均不变时才可缩小范围。
- 手动 workflow_dispatch 可勾选 `full_acceptance` 强制全套。

部署互斥、候选独立构建、磁盘保留规则、凭据管理、基础公网鉴权/联机接口检查、测试账号清理和失败自动回滚不变。未选中的测试不计为“本次通过”。语聊验收使用平台临时账号、真实声网和合成音源；源码与公网路径共用同一脚本。
