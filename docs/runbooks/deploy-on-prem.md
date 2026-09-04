# On-prem HTTPS Deployment Runbook (E01-S028)

This runbook covers two deployment shapes:

1. **`docker compose`** (`infra/docker/docker-compose.yml`) — the production/
   on-prem target: Caddy terminates HTTPS in front of `web`/`admin`/`api`.
2. **`scripts/dev-all.sh`** — a one-command local dev startup (no HTTPS, no
   Docker) for a clean clone. Voice input needs a secure context, so use
   compose (or `mkcert`/an existing HTTPS front) to actually exercise it.

## Why this exists

Voice input (push-to-talk) uses `MediaRecorder`, which browsers only expose
in a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) —
plain `http://` on a LAN host is not one (only `https://` and `localhost`
are). `crypto-random-uuid-polyfill.ts` stays in the codebase for `http`
compatibility elsewhere, but voice specifically **stays unavailable over
plain `http://<lan-host>`** no matter what — this deployment is the fix.

## Known trade-off: `apps/api`'s image runs on `tsx`, not a compiled build

`infra/docker/api.Dockerfile` runs `apps/api` via `pnpm exec tsx
src/main.ts` — the same mechanism `pnpm --filter @ai-km/api dev` already
uses — instead of the "real" production path documented in
`apps/api/README.md` (`pnpm build` then `node dist/main.js`). That path does
not actually work for *anyone*, not just this deployment: `services/conversation`,
`services/identity` and `services/model-gateway` are all `"build": "tsc ...
--noEmit"` with `package.json`'s `main` pointing straight at `./src/index.ts`
— they ship **zero compiled JS**, by design meant to be consumed as raw
TypeScript through a TS-aware runtime. Plain `node dist/main.js` cannot
resolve their `.ts` imports and crashes with `ERR_UNKNOWN_FILE_EXTENSION` /
`ERR_MODULE_NOT_FOUND` — confirmed by actually running it, both inside
Docker and standalone outside it. `apps/web`/`apps/admin` are unaffected:
Next.js's own bundler transpiles workspace packages via `transpilePackages`
in their `next.config.ts`; there is no equivalent step for a non-bundled
Fastify server. Full root-cause writeup and the options considered for a
real fix: `archive/stories/PENDING_DECISIONS.md`.

**This is a stopgap, reviewed and approved by ai-km-e4 (2026-08-28), not the
final design** — a real fix (making `services/*` actually emit compiled JS)
is an architectural decision bigger than this story's scope and is left for
the user to decide whether to commission separately.

**Consequences a deployer needs to know**:
1. `infra/docker/api.Dockerfile` deliberately does **not** use `pnpm install
   --prod` — `tsx` is an `apps/api` **devDependency**, so the image installs
   the full dependency tree, dev tools included. A `--prod`-only install (or
   a multi-stage build that copies only production `node_modules`) would
   leave `tsx` missing and the container would fail to start.
2. **The `api` image therefore ships with the entire TypeScript dev
   toolchain** (`typescript`, `tsx`, `eslint`, `turbo`, …) inside a
   `NODE_ENV=production` container — larger image, larger dependency-CVE
   surface, and "production running a dev tool" as a standing fact about
   this deployment until the underlying `services/*` build gap is fixed.
   Weigh this against your own threat model before shipping this image
   outside a trusted network.

## Hardware / CUDA / models

- **GPU**: an NVIDIA GPU with ≥4.5 GiB free VRAM for the `f16` Whisper
  quantization (see `tools/asr-readiness/src/check-asr.ts`'s
  `F16_MIN_VRAM_MIB`); ≥1 GiB is enough for the `q5_0` fallback. A 4070-class
  card (12 GiB) comfortably fits either. No GPU still works — `whisper-server`
  falls back to CPU, just slower.
- **CUDA**: whatever `whisper.cpp`'s own build docs require for your driver
  version at build time; this repo does not pin a CUDA version itself.
- **Models**: `models/asr/README.md` — download from Hugging Face
  (`ggerganov/whisper.cpp`) into `models/asr/`. `pnpm exec tsx
  tools/asr-readiness/src/check-asr.ts` reports GPU/binary/model readiness
  without downloading or building anything itself.
- **`whisper-server` runs as a host process**, not a container — GPU
  passthrough into Docker is out of this story's scope (see the Non-Goals in
  `archive/stories/specs/E01-S028.spec.md`). `api` reaches it over the network;
  see `infra/docker/docker-compose.yml`'s header comment for the
  `host.docker.internal` (default) vs `network_mode: host` (Linux
  alternative) options.

## Certificates and host name — ASSUMPTIONS (see PENDING_DECISIONS.md)

As of this story, the user has not yet supplied a real internal host name or
a certificate strategy. Two explicit assumptions, both trivially reversible
by changing configuration only (no code change):

1. **Host name** defaults to `localhost` (`AI_KM_PUBLIC_HOST`, unset). Set it
   to your real internal host (e.g. `ai-km.internal`) when you have one.
2. **TLS** defaults to Caddy's own `tls internal` — a locally-trusted,
   self-signed CA Caddy generates and manages itself (see
   `infra/docker/Caddyfile`). This needs no external CA and works
   immediately, at the cost of browsers on OTHER machines not trusting it
   without importing Caddy's root CA. When the user supplies a real
   certificate, replace the `tls internal` line in `infra/docker/Caddyfile`
   with `tls /path/to/cert.pem /path/to/key.pem` (or a real ACME directory) —
   nothing else in this deployment changes.

`apps/admin` is served on a **subdomain** (`admin.<host>`), not a `/admin`
path prefix — see the Caddyfile's own comment for why (breaks Next.js static
assets otherwise, without an `apps/admin` code change this story cannot make).
Cross-subdomain session-cookie sharing (needed once E11-S026 wires up admin
login) uses the *existing* `AI_KM_SESSION_COOKIE_DOMAIN` env var (E02-S033) —
set it to your parent domain once you have a real host, e.g.
`AI_KM_SESSION_COOKIE_DOMAIN=.ai-km.internal`.

## Docker Compose deployment

```bash
cd infra/docker
# Optional: override the defaults (all have sane fallbacks — see
# docker-compose.yml).
export AI_KM_PUBLIC_HOST=ai-km.internal   # defaults to "localhost"
export AI_KM_CADDY_PORT=8443              # defaults to 8443, not 443 — see below
export AI_KM_ASR_SERVER_URL=http://host.docker.internal:8178
export AI_KM_SESSION_COOKIE_DOMAIN=.ai-km.internal

docker compose up --build -d
```

`AI_KM_CADDY_PORT` (default `8443`, not `443`): avoids needing root /
`CAP_NET_BIND_SERVICE`, and — more importantly in this repo, which runs many
parallel git worktrees on one machine — stays completely out of the way of
the `3000`/`3001`/`4000` ports other lanes' dev processes and shared E2E
`apps/api` instance already use. `web`, `admin` and `api` do **not** publish
any port to the host at all (Security AC: "只綁 loopback／容器網路，不對外")
— only `caddy` does, and only the one port.

Verify: `./scripts/prod-check.sh https://<host>:<port>` (defaults to
`https://localhost:8443`).

## `scripts/dev-all.sh` — one-command local dev

```bash
./scripts/dev-all.sh
```

Starts `api` (`:4000` by default), `web` (`:3000`), `admin` (`:3001`), and —
if `AI_KM_ASR_SERVER_BIN` is set — `whisper-server` too. **Refuses to start
if any target port is already in use** (checked before anything is
launched) rather than silently colliding with an already-running instance —
override with `AI_KM_API_PORT`/`WEB_PORT`/`ADMIN_PORT` env vars, or stop
whatever owns that port first. This matters in THIS repo specifically: the
shared `apps/api` on `:4000` that many lanes' E2E setups depend on must never
be fought over by a careless second instance.

No HTTPS here — this is the plain local-dev loop `pnpm dev` already gives
you, just started as one command instead of three terminals. Voice input
will report "needs HTTPS" (correctly) unless the host is `localhost` — that
counts as a secure context on every browser.

## Backup / upgrade

- **Data**: the entire application state is the single SQLite file at
  `AI_KM_DB_PATH` (compose: the `api-data` named volume, mounted at
  `/data/ai-km.sqlite`). Back it up with any file-copy tool — SQLite's own
  [`.backup`](https://www.sqlite.org/lang_vacuum.html#backup) command, or
  simply stop the `api` container and copy the file, is sufficient; there is
  no separate database server to coordinate with.
- **Upgrade**: `git pull`, then `docker compose up --build -d` — this
  rebuilds all three app images and restarts them. Migrations
  (`db/migrations/*.sql`) run automatically at `api` startup
  (`AI_KM_AUTO_MIGRATE`, defaults `true`); nothing else to do by hand.
- **Rollback**: `git checkout <previous-tag>` then `docker compose up
  --build -d` again. Migrations are additive and forward-only by this
  repo's convention (`db/migrations/README.md`) — a rollback that needs a
  schema downgrade is not supported by this runbook and needs its own,
  explicit plan.

## Env variables

`apps/*/.env.example` (`apps/api`, `apps/admin`, `apps/web`) is the source of
truth for the application-level variables below — this table is checked
against them by `scripts/check-env-docs.mjs` (AC4) so it cannot silently
drift. Deployment-only variables (Caddy/compose) are documented separately
further below, since they have no `apps/*/.env.example` counterpart.

<!-- APP_ENV_TABLE_START -->
### apps/api

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Set `production` for a real deployment |
| `AI_KM_API_HOST` | `127.0.0.1` | Compose sets `0.0.0.0` — loopback/container-network only, never published to the host (Security AC) |
| `AI_KM_API_PORT` | `4000` | 1–65535 |
| `AI_KM_DB_PATH` | `./data/ai-km.sqlite` | Compose: `/data/ai-km.sqlite` on the `api-data` volume |
| `AI_KM_CORS_ORIGINS` | *(empty)* | Empty ⇒ CORS plugin not registered at all — same-origin via Caddy needs none |
| `AI_KM_DEV_TRIGGERS` | `false` | **Must** be `false` in production — the server refuses to start otherwise |
| `AI_KM_TEST_SANDBOX` | `false` | **Must** be `false` in production — the server refuses to start otherwise |
| `AI_KM_SEED_DEMO_USERS` | `true` (dev/test), `false` (production) | **Must** be `false` in production (the demo password is public) |
| `AI_KM_SESSION_COOKIE_DOMAIN` | *(empty, host-only cookie)* | Set to the parent domain once `AI_KM_PUBLIC_HOST` is real, so `admin.<host>` shares the session cookie |
| `AI_KM_LOGIN_RATE_LIMIT` | built-in defaults | `perUsernameMaxFailures:5,perIpMaxFailures:20,windowMinutes:15` |
| `AI_KM_ASR_PROVIDER` | `whisper-server` | or `fake` — `fake` **must not** be used in production, the server refuses to start otherwise |
| `AI_KM_ASR_SERVER_URL` | `http://127.0.0.1:8178` | Compose default: `http://host.docker.internal:8178` |
| `AI_KM_ASR_FAKE_TEXT` | `（測試）這是語音辨識的假結果 fake result` | Only used with `AI_KM_ASR_PROVIDER=fake` |
| `AI_KM_LOG_LEVEL` | `info` | pino levels, plus `silent` |

### apps/admin

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | *(unset — no API wiring yet, E11-S026)* | Baked in at `next build` time (Next.js `NEXT_PUBLIC_*` semantics) |

### apps/web

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` (same-origin) | Baked in at `next build` time |
| `NEXT_PUBLIC_AUTH_BACKEND` | `api` (unset) | `mock` uses the in-memory mock, no backend needed |
| `API_INTERNAL_URL` | `http://127.0.0.1:4000` | Server-side only (no `NEXT_PUBLIC_` prefix); compose sets `http://api:4000` |
| `NEXT_PUBLIC_FEATURE_VOICE_INPUT` | enabled (unset) | Set `false` to disable push-to-talk (e.g. no ASR sidecar configured) |
<!-- APP_ENV_TABLE_END -->

### Deployment-only (Caddy / compose — no `apps/*/.env.example` counterpart)

| Variable | Default | Notes |
|---|---|---|
| `AI_KM_PUBLIC_HOST` | `localhost` | **ASSUMPTION** — see above. Read by both `Caddyfile` and `docker-compose.yml` |
| `AI_KM_CADDY_PORT` | `8443` | The only port compose publishes to the host |
| `AI_KM_ASR_SERVER_BIN` | *(unset)* | `scripts/dev-all.sh` only — path to a local `whisper-server` binary; omit to skip starting one |

## Verifying a deployment (AC1–AC3)

```bash
./scripts/validate-deploy.sh          # AC1: docker compose config + caddy validate, no containers started
node scripts/check-env-docs.mjs       # AC4: this table vs apps/*/.env.example
./scripts/prod-check.sh <base-url>    # AC2: curl checks against a RUNNING deployment
```

`prod-check.sh` cannot verify the browser-side `isSecureContext` check or
that the voice button hides its "needs HTTPS" warning — that step is
manual: open the deployment in a browser, log in, and look. See
`archive/stories/E01-S028.md` for this story's actual evidence run.
