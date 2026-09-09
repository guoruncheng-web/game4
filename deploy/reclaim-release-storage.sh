#!/usr/bin/env bash
set -Eeuo pipefail

root=$1
candidate_front=$2
candidate_back=$3
test "$root" = /srv/gameai
[[ "$candidate_front" =~ ^[a-f0-9]{40}$ ]]
[[ "$candidate_back" =~ ^[a-f0-9]{40}$ ]]

frontend_marker="$root/.backend/frontend.current"
if [ ! -s "$frontend_marker" ]; then
  # Older rollback scripts moved the active marker into the failed release but
  # did not restore its predecessor. Recover only from one byte-identical
  # immutable release; ambiguity remains a hard stop.
  matching_fronts=()
  for path in "$root/.releases"/*; do
    [ -d "$path" ] || continue
    sha=$(basename "$path")
    [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || continue
    differences=$(rsync -rlcni --delete \
      --exclude=.backend --exclude=.releases --exclude=.state \
      --exclude=node_modules --exclude=.next --exclude=.env.local \
      --exclude=.git --exclude=server "$path/" "$root/")
    if [ -z "$differences" ]; then matching_fronts+=("$sha"); fi
  done
  if [ "${#matching_fronts[@]}" -ne 1 ]; then
    echo "Cannot recover active frontend marker: exact release matches=${#matching_fronts[@]}" >&2
    exit 1
  fi
  printf '%s\n' "${matching_fronts[0]}" > "$frontend_marker"
  echo "Recovered active frontend marker from immutable release ${matching_fronts[0]}"
fi
active_front=$(cat "$frontend_marker")
active_back=$(basename "$(readlink -f "$root/.backend/current")")
[[ "$active_front" =~ ^[a-f0-9]{40}$ ]]
[[ "$active_back" =~ ^[a-f0-9]{40}$ ]]

declare -A retained_backends=(["$active_back"]=1 ["$candidate_back"]=1)
active_rollback="$root/.backend/rollback/$active_front"
for reference in backend.previous backend.compatible; do
  if [ -s "$active_rollback/$reference" ]; then
    referenced=$(basename "$(cat "$active_rollback/$reference")")
    [[ "$referenced" =~ ^[a-f0-9]{40}$ ]]
    retained_backends["$referenced"]=1
  fi
done

echo 'Storage before inactive release reclamation'
df -Pk "$root"

for path in "$root/.releases"/*; do
  [ -e "$path" ] || continue
  sha=$(basename "$path")
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || continue
  if [ "$sha" != "$active_front" ]; then
    echo "Reclaiming inactive frontend release $sha"
    rm -rf -- "$path"
  fi
done

for path in "$root/.backend/rollback"/*; do
  [ -e "$path" ] || continue
  sha=$(basename "$path")
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || continue
  if [ "$sha" != "$active_front" ]; then
    echo "Reclaiming inactive rollback $sha"
    rm -rf -- "$path"
  fi
done

for path in "$root/.backend/releases"/*; do
  [ -e "$path" ] || continue
  sha=$(basename "$path")
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || continue
  if [ -z "${retained_backends[$sha]+x}" ]; then
    echo "Reclaiming inactive backend release $sha"
    rm -rf -- "$path"
  fi
done

test -d "$root/.releases/$active_front"
test -d "$root/.backend/releases/$active_back"
echo 'Storage after inactive release reclamation'
df -Pk "$root"
