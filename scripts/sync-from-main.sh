#!/usr/bin/env bash
# sync-from-main — bring the current branch up to date with origin/main.
#
# Default mode is `merge --no-ff` (preserves a visible "absorbed main" commit).
# Pass --rebase to rewrite history instead.
#
# Usage:
#   scripts/sync-from-main.sh           # merge
#   scripts/sync-from-main.sh --rebase  # rebase onto origin/main

set -euo pipefail

mode="merge"
for a in "$@"; do
  case "$a" in
    --rebase) mode="rebase" ;;
    --merge)  mode="merge" ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $a" >&2
      exit 2
      ;;
  esac
done

current="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current" = "main" ]; then
  echo "you're on main — nothing to sync" >&2
  exit 0
fi

# Fetch with simple retry — flaky network shouldn't kill the script.
attempts=0
until git fetch origin main; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 3 ]; then
    echo "fetch failed after $attempts attempts" >&2
    exit 1
  fi
  sleep $((attempts * 2))
done

base="$(git merge-base HEAD origin/main)"
target="$(git rev-parse origin/main)"

if [ "$base" = "$target" ]; then
  echo "already up to date with origin/main"
  exit 0
fi

if [ "$mode" = "rebase" ]; then
  echo "rebasing $current onto origin/main"
  git rebase origin/main
else
  echo "merging origin/main into $current"
  git merge --no-ff origin/main \
    -m "chore: sync $current with origin/main"
fi

echo "done."
