# scripts/

Repo-root operational scripts (E01-S028). See `docs/runbooks/deploy-on-prem.md`
for the full walkthrough.

| Script | Purpose |
|---|---|
| `dev-all.sh` | One-command local dev startup: api + web + admin (+ optional whisper-server). Refuses to start on a port already in use. |
| `validate-deploy.sh` | Static validation only, no containers started: `docker compose config`, `caddy validate`, the `.gitignore` cert-key check, env-docs consistency. |
| `check-env-docs.mjs` | AC4: the runbook's env table vs `apps/*/.env.example`'s actual keys. Called by `validate-deploy.sh`; also runnable standalone (`node scripts/check-env-docs.mjs`). |
| `prod-check.sh <base-url>` | Smoke-checks a RUNNING deployment: direct `/v1/health`, proxied `/api/v1/health`, and the web root, over HTTPS. |
