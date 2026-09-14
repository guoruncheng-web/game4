# Preparation compact layout / PWA v96 candidate

Game runtime source: `1d4a4fa3eec9b9db0004f3b927f314e88367d105`.
Backend unchanged: `0773aee8070261b1bdf89ff3a6c9ab6710ab41f4`.
Previous live frontend: `95ab10b0027a332593507346ae575a5da01e2335` (v95).

Fix the Preparation root shrinking to 64% in a 390×496 voice-room viewport. Keep control sizes and compress vertical layout; restore authored layout at 780 logical pixels. Four viewport checks, resize restoration, actual exchange/seating/add-bot input, wallet/session/settlement tests pass. Source and exact hosted build manifest are recorded alongside evidence.

Frontend lint/build and 22 deployment/version tests pass. Local production PWA cold/cached/offline: 5721/2538/2529 ms. Exchange, bot match, settlement return, trusted audio, cache contents and offline play pass without runtime/resource errors. No backend or other game runtime changes. Existing Next middleware deprecation remains a build warning.

Public deployment and acceptance pending. Prior v95 cross-region cold startup exceeded 30 seconds; no budget exemption is inferred for this release. Rollback remains the workflow rollback to previous production; retain the original game tree at studio releases/preparation-v96-backup-game-v95.
