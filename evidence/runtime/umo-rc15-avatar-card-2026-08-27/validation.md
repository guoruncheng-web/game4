# UMO RC15 avatar and loading-card deployment validation

Date: 2026-08-27

## Release identity

- UMO source commit: `91715f5a1cfd1547b1f4a74888d5cc42b7d4e569`
- game4 base (`origin/main` before release): `14e6ffb6057984a6b2c489cc7e928f9fec7139a1`
- Cocos Creator: 3.8.8
- Target: `web-mobile` release
- Boot scene UUID: `a773f311-9d5d-405f-bda8-294a1c21626a`
- Candidate build: `web-mobile-rc15-avatar-card-vfx-2026-08-27/web-mobile`

## Exact game-tree replacement

- Source files: 108
- Target files: 108
- Source/target bytes: 10,820,464
- Canonical relative SHA-256 manifest: `1fab14c413602436ec5c3e71c0804b06182ca4a7c489a28aca7b0e58fa1704c7`
- Local recoverable backup: `/Users/mac/projects/oner/game/.codex-backups/umo-rc15-avatar-card-2026-08-27/game`
- Service Worker and offline-test cache version: `v35`

The published Cocos tree was replaced as a whole and verified byte-for-byte against the accepted RC15 output. No other game tree is in scope.

## Splash identity

- Custom UMO logo SHA-256: `a49f700bea326f87582ac5865750237a6ec7895fddd49876c5529cf3a8870c1d`
- Logo ratio: 0.78
- Total splash time: 1800 ms
- Background: `(0.015686, 0.031373, 0.086275, 1)`

## Functional and production gates

- UMO authoritative tests: 40,056 assertions; classic 10,000 and teams 10,000; `failures: []`.
- game4 `pnpm umo:test`: classic, teams2v2, automation, solo bots, and persisted snapshots passed.
- game4 `pnpm lint`: passed.
- game4 `pnpm build`: passed with Next 16.3.
- Local production PWA acceptance: `accepted: true`.
- First-load MainMenu: 3,498 ms; online replay: 2,244 ms; after exit/re-entry: 4,870 ms; offline reload: 2,233 ms.
- Service Worker controlled the page. Shell, asset, and static `v35` caches existed; the UMO route, game index, settings, and main bundle were cached.
- Trusted audio interaction reached `AudioContext.state === "running"` after unmute.
- Exit control returned to `/` and the game reopened successfully.

See `pwa-local.json` and `pwa-local.png` in this directory for machine-readable and visual evidence.

## Public production acceptance

- Deployment Actions run: `33098940652`; all build, restart, and smoke-check steps passed in 57 seconds.
- `https://www.gameai.xingzdh.com/`: HTTP 200.
- `https://www.gameai.xingzdh.com/umo`: HTTP 200.
- `/ws/health`: `ok: true`.
- Fresh-profile first-load MainMenu: 71,874 ms.
- Warm online replay: 4,964 ms; after exit/re-entry: 4,216 ms; offline reload: 2,249 ms.
- Service Worker controlled the page; all `v35` caches and required UMO entries were present.
- Trusted audio reached `running`, exit returned to `/`, and offline replay returned to MainMenu.
- Public production acceptance result: `accepted: true`.

See `pwa-public.json` and `pwa-public.png` in this directory. The cross-region cold-start result is accepted as a non-blocking performance risk by the release policy, but **performance exemption does not mean performance passed**; 71.874 seconds remains an optimization target. PWA takeover, trusted audio, cache contents, offline reload, protocol, Actions, and online health were not exempted.

## Avatar acceptance boundary

The RC15 standalone acceptance used an authenticated-session payload and proves that the account avatar replaces the baked person glyph instead of covering it. A fresh game4 browser profile is intentionally unauthenticated, so it validates the guest fallback and PWA behavior, not a real production account. The production host exposes `/api/auth/me`; authenticated public-account validation remains a separate credentialed check and is not falsely claimed here.

## Known non-blocking warnings

- The Cocos build profile emitted the known `mainBundleCompressionType` fallback to `merge_dep`.
- Node emitted the known `MODULE_TYPELESS_PACKAGE_JSON` warning for the isolated UMO TypeScript loader.
- Next emitted its middleware deprecation warning.

None changed the release output or caused a failed assertion.

## Rollback

Revert the game4 release commit and redeploy. The named local backup is an additional recovery aid, but rollback authority is the committed predecessor on `origin/main`.
