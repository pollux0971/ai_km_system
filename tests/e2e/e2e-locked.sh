#!/bin/bash
# E04-S057 reference wrapper for the fleet's shared E2E lock.
#
# Usage:
#   e2e-locked.sh <owner-label> -- <command...>
#
# Example:
#   ./e2e-locked.sh "w4-E03S039" -- pnpm exec playwright test --project=web
#
# What this does:
#   1. Acquires an flock on /data/python/AI_KM-worktrees/.e2e.lock, waiting
#      up to 1 hour for it to free.
#   2. Writes /data/python/AI_KM-worktrees/.e2e.owner with a human-readable
#      "<label> pid=<pid> <timestamp>" line, for other lanes to eyeball.
#   3. Writes /data/python/AI_KM-worktrees/.e2e.owner.token with a fresh
#      random token, generated ONCE per acquisition, and exports the SAME
#      value as AI_KM_E2E_LOCK_TOKEN for the wrapped command and everything
#      it spawns. playwright.config.ts's assertNotBlockingLockHolder()
#      (helpers/lock-guard.ts) compares against this token, not the
#      human-readable line above — a re-worded/re-timestamped owner line
#      from the SAME holder must never make the holder block itself.
#   4. Removes .e2e.owner (and its .token sibling) on exit — success,
#      failure, or interrupt — so the lock always reflects real state.
#   5. Runs the given command; its exit code becomes this script's exit code.
#
# On abort: kill the wrapper's PROCESS GROUP (`kill -TERM -<pgid>`), not
# just this script's own PID — Playwright's webServers run in a different
# process group from the flock's fd-holding group, so killing only the
# flock group can release the lock while leaving :3000/:3001/:4100 still
# occupied (measured by W1, 2026-08-29; see ROADMAP_TEMP.md §5-eta).
# Verify with `ss -ltnp` showing the ports free — not `fuser` on the lock
# file, which only proves the flock itself released.
set -uo pipefail

LOCK_FILE="/data/python/AI_KM-worktrees/.e2e.lock"
OWNER_FILE="/data/python/AI_KM-worktrees/.e2e.owner"
TOKEN_FILE="${OWNER_FILE}.token"

if [ "$#" -lt 3 ] || [ "$2" != "--" ]; then
  echo "Usage: $0 <owner-label> -- <command...>" >&2
  exit 64
fi

LABEL="$1"
shift 2

TOKEN="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N)"

exec 200>"$LOCK_FILE"
flock -w 3600 200 || { echo "[e2e-locked] timed out waiting for $LOCK_FILE" >&2; exit 1; }

echo "${LABEL} pid=$$ $(date -Is)" > "$OWNER_FILE"
echo "$TOKEN" > "$TOKEN_FILE"
export AI_KM_E2E_LOCK_TOKEN="$TOKEN"

cleanup() {
  rm -f "$OWNER_FILE" "$TOKEN_FILE"
}
trap cleanup EXIT

"$@"
