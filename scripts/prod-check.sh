#!/usr/bin/env bash
# E01-S028 AC2 — post-deploy smoke check against a RUNNING deployment
# (docker-compose stack or dev-all): the proxied api/health, the web root
# (secure-context prerequisites), and, only if explicitly asked for, a
# direct (non-proxied) api check.
#
# Usage: ./scripts/prod-check.sh [https://host:port]
# Defaults to https://localhost:8443 (docker-compose's default).
#
# Deliberately does NOT default to checking apps/api directly on
# 127.0.0.1:4000: `infra/docker/docker-compose.yml` intentionally does not
# publish that port to the host (Security AC — see its header comment), so
# there is nothing at "the api's own port" to check from a compose
# deployment, by design. This repo also runs a shared, long-running apps/api
# on :4000 that many lanes' E2E setups depend on — a script that silently
# curls "whatever answers on :4000" from a shared host can validate the
# WRONG server without any error (this bit while writing this script; see
# archive/stories/E01-S028.md). Pass --direct-api <url> only when you actually
# have one to check (e.g. dev-all.sh, or `docker compose exec api curl ...`
# from inside the compose network).
set -euo pipefail

BASE_URL="https://localhost:8443"
DIRECT_API_URL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --direct-api)
      DIRECT_API_URL="$2"
      shift 2
      ;;
    *)
      BASE_URL="$1"
      shift
      ;;
  esac
done

fail=0
check() {
  local name="$1" cmd="$2"
  printf '%-45s' "$name"
  if eval "$cmd" >/tmp/prod-check-out.$$ 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    sed 's/^/    /' /tmp/prod-check-out.$$
    fail=1
  fi
  rm -f /tmp/prod-check-out.$$
}

echo "== prod-check against $BASE_URL =="

if [ -n "$DIRECT_API_URL" ]; then
  check "api direct /v1/health (2xx)" \
    "curl -sf -o /dev/null $DIRECT_API_URL/v1/health"
fi

check "proxied /api/v1/health (2xx, self-signed cert)" \
  "curl -sf -k -o /dev/null $BASE_URL/api/v1/health"

check "web root reachable through Caddy (2xx, self-signed cert)" \
  "curl -sf -k -o /dev/null $BASE_URL/"

echo
if [ "$fail" -ne 0 ]; then
  echo "prod-check: one or more checks FAILED."
  exit 1
fi
echo "prod-check: all checks passed."
echo
echo "Manual step (cannot be scripted with curl): open $BASE_URL in a browser,"
echo "log in, and confirm the voice input button does NOT show a \"needs HTTPS\""
echo "warning — that is the isSecureContext check (AC2's screenshot evidence)."
