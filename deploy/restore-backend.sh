#!/usr/bin/env bash
set -Eeuo pipefail
root=$1
backup=$2
if [ -s "$backup/backend.compatible" ]; then
  target=$(cat "$backup/backend.compatible")
  case "$target" in "$root/.backend/releases/"*) ;; *) exit 1 ;; esac
  test -d "$target"
  node "$target/deploy/bot-release-env.mjs" "$root/.backend/.env" disable
  ln -sfn "$target" "$root/.backend/current"
  echo 'Rollback retains v4-compatible backend with bot entry points disabled; live state preserved'
elif [ -s "$backup/backend.previous" ]; then
  ln -sfn "$(cat "$backup/backend.previous")" "$root/.backend/current"
fi
