#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
front_sha=$1
back_sha=$2
[[ "$front_sha" =~ ^[a-f0-9]{40}$ && "$back_sha" =~ ^[a-f0-9]{40}$ ]]
root=/srv/gameai
front="$root/.releases/$front_sha"
back="$root/.backend/releases/$back_sha"
backup="$root/.backend/rollback/$front_sha"
export PATH=/opt/node24/bin:/usr/local/bin:$PATH
mkdir -p "$backup/source"
test -f "$back/dist/apps/gateway/main.js"
test -f "$front/package.json"
# Build the isolated frontend while the current site keeps serving its old build.
if [ ! -d "$front/node_modules" ]; then cp -a --reflink=auto "$root/node_modules" "$front/node_modules"; fi
cd "$front"
CI=true pnpm install --frozen-lockfile
BACKEND_GATEWAY_URL=http://127.0.0.1:7011 CI=true pnpm build
node "$back/deploy/prepare-env.mjs" "$root" "$back_sha"
(cd "$back" && node --env-file="$root/.backend/.env" scripts/db/init.mjs)
rsync -a --exclude=.backend --exclude=.releases --exclude=.state --exclude=node_modules --exclude=.next --exclude=.env.local --exclude=.git "$root/" "$backup/source/"
cp -p "$root/.env.local" "$backup/frontend.env"
readlink "$root/.backend/current" > "$backup/backend.previous" || true
cutover=0
rollback() {
  code=$?
  if [ "$code" -ne 0 ] && [ "$cutover" = 1 ]; then
    echo 'Release failed: restoring previous frontend and service entrypoints'
    rsync -a --delete --exclude=.backend --exclude=.releases --exclude=.state --exclude=node_modules --exclude=.next --exclude=.env.local --exclude=.git "$backup/source/" "$root/"
    cp -p "$backup/frontend.env" "$root/.env.local"
    if [ -d "$backup/next" ]; then if [ -d "$root/.next" ]; then mv "$root/.next" "$backup/failed-next"; fi; mv "$backup/next" "$root/.next"; fi
    if [ -d "$backup/node_modules" ]; then if [ -d "$root/node_modules" ]; then mv "$root/node_modules" "$backup/failed-node_modules"; fi; mv "$backup/node_modules" "$root/node_modules"; fi
    if [ -s "$backup/backend.previous" ]; then ln -sfn "$(cat "$backup/backend.previous")" "$root/.backend/current"; fi
    sudo systemctl restart gameai-ws
    sudo systemctl restart gameai
  fi
  exit "$code"
}
trap rollback EXIT
cutover=1
mv "$root/.next" "$backup/next"
mv "$root/node_modules" "$backup/node_modules"
rsync -a --delete --exclude=.backend --exclude=.releases --exclude=.state --exclude=node_modules --exclude=.next --exclude=.env.local --exclude=.git "$front/" "$root/"
mv "$front/.next" "$root/.next"
mv "$front/node_modules" "$root/node_modules"
cp -p "$root/.backend/frontend.env.next" "$root/.env.local"
ln -sfn "$back" "$root/.backend/current"
# The deploy user can restart existing units but cannot change systemd configuration.
# These generated compatibility files contain no business code or credentials.
mkdir -p "$root/server"
cp "$back/deploy/systemd-bootstrap.mjs" "$root/server/ws.mjs"
printf '// Existing systemd preload retained; Nest output needs no TS loader.\n' > "$root/server/ts-register.mjs"
sudo systemctl restart gameai-ws
for attempt in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7011/api/auth/me || true)" = 401 ]; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7011/api/auth/me)" = 401
sudo systemctl restart gameai
for attempt in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7010/ || true)" = 200 ]; then break; fi
  sleep 1
done
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7010/)" = 200
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7010/api/wallet)" = 401
sudo systemctl is-active gameai
sudo systemctl is-active gameai-ws
# Prove existing units supervise all four loopback services.
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7101/api/wallet)" = 401
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7102/api/games/thirteen/version)" = 401
printf '%s\n' "$front_sha" > "$root/.backend/frontend.current"
echo "Release ready: frontend=$front_sha backend=$back_sha rollback=$backup"
