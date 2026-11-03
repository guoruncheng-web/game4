# Historical game snapshots — 2026-11-03

Owner authorized backing up old game copies before deleting the local copies.
This archive branch preserves six exact historical source/asset snapshots under their original directory names. It is not a current product release.

Excluded from Git: node_modules and .next (regenerable), broken .git pointers, Finder metadata and private .env.local files. Private local files and all non-cache originals are retained in a separately verified, restricted local archive on the Mac. No credentials are published.

Restore source: clone this branch, then use the selected snapshot directory. The owner can reinstall dependencies on Mac using its pnpm-lock.yaml and rebuild .next. For exact original non-cache files including private settings, use the local backup described in the Mac restore instructions. Git snapshots intentionally do not preserve the old broken worktree pointers.

Local backup: /Users/mac/projects/oner/game-backups/retired-six-20261103/

SHA-256 file manifest: ARCHIVE_FILES.json. Git working branches, active PWA changes, company CDN games and deployment state are unaffected.
