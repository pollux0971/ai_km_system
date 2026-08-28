# infra/docker

On-prem HTTPS deployment (E01-S028): Caddy reverse proxy + compose for
`web`/`admin`/`api`. `whisper-server` is a host process, not a container
(GPU passthrough is out of scope) — see the runbook for how `api` reaches it.

- `docker-compose.yml` — the three app services + `caddy`. Only `caddy`
  publishes a port to the host.
- `Caddyfile` — HTTPS termination, `tls internal` (self-signed) by default;
  `admin` is routed by subdomain (`admin.<host>`), not a `/admin` path
  prefix — see the file's own header comment for why.
- `api.Dockerfile` / `web.Dockerfile` / `admin.Dockerfile` — build from the
  **repo root** as context (`docker build -f infra/docker/api.Dockerfile .`
  from the repo root, or `docker compose up --build` from this directory).

Full walkthrough: `docs/runbooks/deploy-on-prem.md`. Static validation
(no containers started): `./scripts/validate-deploy.sh` from the repo root.
