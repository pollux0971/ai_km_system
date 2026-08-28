#!/bin/sh
# E01-S028 — resolves `host.docker.internal` to its numeric IP before
# starting apps/api.
#
# services/model-gateway/src/config.ts's SSRF guard (`isLoopbackOrPrivateHost`)
# only accepts a numeric loopback/private-range IP literal (or literally
# "localhost"/"::1") in AI_KM_ASR_SERVER_URL — it checks the URL's hostname
# STRING, not what that hostname resolves to. "host.docker.internal" is a
# DNS name (Docker's `extra_hosts: host-gateway` mapping resolves it to the
# real bridge-gateway IP, e.g. 172.17.0.1, at container start — confirmed
# via `getent hosts host.docker.internal` inside this image), so the literal
# default this compose file ships would otherwise be refused at startup with
# "不是 loopback 或私網位址". Substituting the already-resolved numeric IP
# here satisfies that guard without weakening it — the guard's own
# private-range allowlist is exactly what host.docker.internal actually
# resolves to, so nothing untrusted is being let through, only the DNS-name
# spelling of an already-trusted address is being avoided.
set -eu

if [ "${AI_KM_ASR_SERVER_URL:-}" != "" ]; then
  case "$AI_KM_ASR_SERVER_URL" in
    *host.docker.internal*)
      resolved_ip="$(awk '/host\.docker\.internal/ {print $1; exit}' /etc/hosts)"
      if [ -n "$resolved_ip" ]; then
        AI_KM_ASR_SERVER_URL="$(echo "$AI_KM_ASR_SERVER_URL" | sed "s/host\.docker\.internal/$resolved_ip/")"
        export AI_KM_ASR_SERVER_URL
        echo "[api-entrypoint] resolved host.docker.internal -> $resolved_ip (AI_KM_ASR_SERVER_URL=$AI_KM_ASR_SERVER_URL)"
      fi
      ;;
  esac
fi

exec "$@"
