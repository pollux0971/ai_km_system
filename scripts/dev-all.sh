#!/usr/bin/env bash
# E01-S028 AC3 — one-command local dev startup: api + web + admin, plus an
# optional whisper-server host process if AI_KM_ASR_SERVER_BIN is set.
#
# HARD SAFETY RULE (do not remove): this script must NEVER silently reuse or
# fight over a port something else already owns. This repo runs many
# parallel git worktrees; :4000 in particular is very often a LONG-RUNNING
# shared apps/api instance that other sessions' E2E setups depend on. If any
# target port is already listening, this script refuses to start that
# process and exits non-zero with a clear message — it does not guess, and
# it does not "just try anyway".
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

API_PORT="${AI_KM_API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
ADMIN_PORT="${ADMIN_PORT:-3001}"

log() { printf '[dev-all] %s\n' "$1"; }

port_in_use() {
  # Works without lsof/nc being installed everywhere: try /dev/tcp, a bash
  # builtin, first; fall back to `ss` if present.
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" 2>/dev/null | grep -q ":$port" && return 0
  fi
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3>&-; return 0; }
  return 1
}

guard_port() {
  local name="$1" port="$2"
  if port_in_use "$port"; then
    echo "[dev-all] ERROR: port $port ($name) is already in use." >&2
    echo "[dev-all] Refusing to start a second $name — this is very likely another worktree's already-running instance (e.g. the shared :4000 apps/api many lanes' E2E setups depend on)." >&2
    echo "[dev-all] Set ${name^^}_PORT (or AI_KM_API_PORT for api) to a free port and re-run, or stop whatever owns $port first." >&2
    exit 1
  fi
}

log "Checking ports before starting anything (api:$API_PORT, web:$WEB_PORT, admin:$ADMIN_PORT)..."
guard_port "api" "$API_PORT"
guard_port "web" "$WEB_PORT"
guard_port "admin" "$ADMIN_PORT"

pids=()
cleanup() {
  log "Stopping..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

log "Installing dependencies (pnpm install --frozen-lockfile)..."
pnpm install --frozen-lockfile

log "Starting api on :$API_PORT..."
AI_KM_API_PORT="$API_PORT" pnpm --filter @ai-km/api dev &
pids+=("$!")

log "Starting web on :$WEB_PORT..."
(cd apps/web && pnpm exec next dev -p "$WEB_PORT") &
pids+=("$!")

log "Starting admin on :$ADMIN_PORT..."
(cd apps/admin && pnpm exec next dev -p "$ADMIN_PORT") &
pids+=("$!")

if [ -n "${AI_KM_ASR_SERVER_BIN:-}" ]; then
  log "Starting whisper-server ($AI_KM_ASR_SERVER_BIN)..."
  "$AI_KM_ASR_SERVER_BIN" &
  pids+=("$!")
else
  log "AI_KM_ASR_SERVER_BIN not set — skipping whisper-server (voice input will report ASR unavailable; see docs/runbooks/deploy-on-prem.md)."
fi

log "Started. URLs:"
log "  api:   http://127.0.0.1:$API_PORT/v1/health"
log "  web:   http://127.0.0.1:$WEB_PORT"
log "  admin: http://127.0.0.1:$ADMIN_PORT"
log "Ctrl+C to stop everything."

wait
