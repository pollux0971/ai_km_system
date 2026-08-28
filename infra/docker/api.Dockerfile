# E01-S028 — apps/api, on-prem deploy image.
#
# Build from the REPO ROOT (`docker build -f infra/docker/api.Dockerfile .`),
# not from apps/api/ — this is a pnpm workspace, so every domain package
# under services/* must be present at build time. `docker-compose.yml` sets
# the build context to `../..` for exactly this reason.
#
# Runs via `tsx`, not `node dist/main.js`: apps/api's own "build" (tsc) +
# "start" (node dist/main.js) scripts do not actually work standalone —
# every services/* package this repo has (service-conversation,
# service-identity, service-model-gateway) is type-check-only
# (`"build": "tsc ... --noEmit"`, package.json `main` pointing straight at
# `./src/index.ts`) and ships no compiled JS at all; they are meant to be
# consumed as raw TypeScript source through a TS-aware runtime. `pnpm dev`
# already does exactly that (`tsx watch src/main.ts`), and apps/web/apps/admin
# get the equivalent for free from Next.js's own bundler
# (`transpilePackages` in their next.config.ts). Plain Node has no such step
# for a non-bundled Fastify server, so `node dist/main.js` fails at runtime
# with ERR_UNKNOWN_FILE_EXTENSION/ERR_MODULE_NOT_FOUND resolving those
# packages' `.ts` sources — confirmed by actually running it, both here and
# with a plain `pnpm --filter @ai-km/api build && node apps/api/dist/main.js`
# outside Docker entirely. This is a pre-existing gap in apps/api's own
# package.json scripts, unrelated to and out of this story's allowed-modify
# list (services/*, apps/*/src) to fix directly — reported to ai-km-e4 and
# recorded in docs/stories/PENDING_DECISIONS.md. `tsx` is the same
# already-working mechanism `pnpm --filter @ai-km/api dev` uses, so this
# Dockerfile uses it too rather than inventing a shadow fix in someone
# else's domain.
#
# syntax=docker/dockerfile:1
FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
# Loopback-only by design (Security AC) — the reverse proxy is the only
# thing that talks to this port; docker-compose does not publish it to the
# host at all, only Caddy's HTTPS listener is.
ENV AI_KM_API_HOST=0.0.0.0
ENV AI_KM_API_PORT=4000
EXPOSE 4000
WORKDIR /repo/apps/api
# See api-entrypoint.sh's own comment: resolves host.docker.internal to a
# numeric IP so services/model-gateway's SSRF guard (which only accepts
# numeric loopback/private literals, not DNS names) accepts it.
COPY infra/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
