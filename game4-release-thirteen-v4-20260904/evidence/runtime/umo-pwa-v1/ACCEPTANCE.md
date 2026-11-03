# UMO PWA Acceptance

Date: 2026-08-26

Result: **Accepted for game4 deployment**.

- Same-origin `/umo` host and Cocos iframe boot to `MainMenu`.
- MainMenu → Lobby creates a fresh authoritative six-digit room with no runtime errors.
- Service Worker v24 cached 200 requested UMO runtime files and replayed MainMenu offline.
- Exact server core completed four-client classic and teams2v2 WebSocket matches with private-hand isolation and recovery.
- NumPy comparison against the accepted Cocos MainMenu baseline measured MAE 2.8919 outside the game4 back-button overlay.
- Final Cocos package contains 207 files / 22,040,402 bytes and was built as Creator 3.8.8 Web Mobile release with an explicit Boot scene.

`pwa-offline-report.json`, `numpy-visual-comparison.json`, the normalized render and amplified diff are the machine-readable acceptance record.
