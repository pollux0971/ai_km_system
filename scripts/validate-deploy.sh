#!/usr/bin/env bash
# E01-S028 AC1 — static validation, no containers actually started.
# Run from anywhere: `./scripts/validate-deploy.sh`
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/infra/docker/docker-compose.yml"
caddyfile="$repo_root/infra/docker/Caddyfile"

echo "== docker compose config =="
docker compose -f "$compose_file" config --quiet
echo "OK"

echo "== caddy validate =="
docker run --rm -v "$caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
echo "OK"

echo "== .gitignore covers TLS private keys (Security AC) =="
node "$repo_root/scripts/check-gitignore-certs.mjs"

echo "== env docs consistency (AC4) =="
node "$repo_root/scripts/check-env-docs.mjs"

echo "All static validation passed."
