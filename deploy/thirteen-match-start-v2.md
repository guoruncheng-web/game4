# Thirteen match-start v2 / PWA v68

User approved the synchronized local candidate for release acceptance on 2026-09-07.

- Game source: 7b3ae6e19c1cfb9c438707cec196f2d2dd73deeb
- Backend pin: bb9bec16865e5e57a085160ad95e0324b4d01ec9
- Frontend baseline / rollback: 043a224a825207d959c71cd583cd2ca5a601d893 (v66)
- Previous backend pin: 3982baa91eb865ce6e37fea4728bd9fffdf4f30e
- Creator: 3.8.8, web-mobile release, Main 5066c4ee-d702-4879-8ddb-a69b5836eb08
- Exact build tree: 628 files, 22,884,050 bytes. Sorted JSON file-to-SHA256 manifest digest: 36432994a4a40f7bef5dc418895d84aacd3b99ee42b2393deeb8bc44633d66e0.
- Old local tree: /Users/mac/projects/.codex-tmp/thirteen-match-start-v2-host-before

Four-seat settlement, 3/2/1 paper signs and Start reveal consume the server-owned 4.6-second preparation stage after R04 resource readiness. First-turn time begins at authoritative deal. Changes are limited to Thirteen static files/route, linked Service Worker version, backend pin, release documentation and the required public countdown check.

Local source (139), backend Thirteen (36), security (6), view (12), four real PWA clients including reconnect and confirmed room departure, fresh-profile trusted audio/cache/offline, production builds and lint passed. Raw generated files and evidence logs keep original formatting. Minimum physical-device profiling remains unmeasured; the existing cross-region startup exception is not performance passing.

Actions deploys the pinned backend and PWA together, verifies public four-player countdown and existing auth/protocol/audio/offline gates, and automatically restores the previous release on failure. For manual rollback use the existing nest-rollback.sh for the deployed frontend SHA, then revert this frontend release commit before the next deployment; preserve live database and encrypted state.

First attempt e0e5388fb5e58949956d6163d223bd7f33391681 / Actions 34091691855 was automatically rolled back after the four-browser readiness probe exceeded its fixed 60-second wait. All four lobbies had loaded, with no runtime exceptions. Retry v68 preserves the game tree, adds per-client preparation diagnostics and configures a 180-second functional preparation bound. Actual timing and the original failure are retained; performance is not marked passed.
