#!/usr/bin/env bash
set -Eeuo pipefail
export PATH=/opt/node24/bin:/usr/local/bin:$PATH
release_sha=$1
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]]
script_dir=$(cd "$(dirname "$0")" && pwd)
root=/srv/gameai
backup="$root/.backend/rollback/$release_sha"
test -d "$backup/next"
test "$(cat "$root/.backend/frontend.current")" = "$release_sha"
rsync -a --delete --exclude=.backend --exclude=.releases --exclude=.state --exclude=node_modules --exclude=.next --exclude=.env.local --exclude=.git "$backup/source/" "$root/"
cp -p "$backup/frontend.env" "$root/.env.local"
mv "$root/.next" "$backup/failed-next"
mv "$backup/next" "$root/.next"
mv "$root/node_modules" "$backup/failed-node_modules"
mv "$backup/node_modules" "$root/node_modules"
bash "$script_dir/restore-backend.sh" "$root" "$backup"
mv "$root/.backend/frontend.current" "$backup/failed-frontend.current"
sudo systemctl restart gameai-ws
sudo systemctl restart gameai
for attempt in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7010/ || true)" = 200 ]; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7010/)" = 200
sudo systemctl is-active gameai
sudo systemctl is-active gameai-ws
echo "Previous release restored; failed release $release_sha retained for diagnosis"
