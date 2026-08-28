# UMO Chromatic Relay release record — 2026-08-28

- Cocos source commit: `e896c3d4bdb32c9963848c1f790f19207fd13326`
- game4 baseline: `bb947e762fb7e24e0bc5e1178f557a3cbc74e00f` (`origin/main` cached before network recovery)
- game4 payload commit: `ed969f8ca7a7d37b708522495e4134081dd79619`
- release branch: `release/umo-chromatic-relay-20260828`
- Creator: 3.8.8
- Boot UUID: `a773f311-9d5d-405f-bda8-294a1c21626a`
- Cocos build: `fresh-ui-rc3/web-mobile`
- build tree: 140 files, 31,696,743 bytes
- build tree manifest SHA-256: `56697dc3edd7ad5197f94b9e5a806f33c373dd38ad86a4df69b7174a70dd471e`
- custom splash Logo SHA-256: `366c3b882359ead40ed67a78f66fb88510178decc3db2c11b6438f7bc8db3dfd`
- Service Worker caches: `v36`
- pre-release backup: `/Users/mac/projects/oner/game/game4-backups/umo-game-bb947e7-before-chromatic-relay-20260828`

## Local production acceptance

- `pnpm umo:test`: passed, Classic + 2v2 + automation + solo, `failures: []`.
- `pnpm lint`: passed.
- `pnpm build`: passed on Next 16.3.0; TypeScript and 19 static pages passed.
- Fresh-profile PWA: accepted.
- First controlled MainMenu: 4,019 ms; online reload: 2,581 ms; offline reload: 2,564 ms.
- Trusted unmute: Web Audio `contextState=running`, `busesReady=true`.
- Cache: UMO assets 69; route/index/settings/main bundle cached in `v36`.
- Exit control returns to `/`; return to `/umo` and offline MainMenu both passed.
- Source and host tree inventories have the same manifest SHA-256.

## Public deployment gate

The payload is locally approved. Before pushing, fetch `origin/main` and require the remote HEAD to remain `bb947e762fb7e24e0bc5e1178f557a3cbc74e00f`; otherwise rebase/cherry-pick into a fresh candidate and repeat the production acceptance. After push, require Actions success plus public `/`, `/umo`, `/ws/health`, fresh-profile trusted audio, cache and offline reload acceptance.

## Rollback

Revert the game4 payload commit and restore the prior `public/umo/game` tree from the named backup if an immediate local rollback is required. For production, use the deployment workflow rollback/redeploy procedure; do not manually mutate the server tree.
