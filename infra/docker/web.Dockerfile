# E01-S028 — apps/web, on-prem deploy image.
# Build from the REPO ROOT: `docker build -f infra/docker/web.Dockerfile .`
#
# syntax=docker/dockerfile:1
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /repo/apps/web
# Same-host deployment shares one cookie jar across web/admin/api behind
# Caddy (E11-S026's precondition) — apps/web's own /api/v1/:path* rewrite
# proxies server-side to the api container over the compose network, not a
# publicly-reachable host, so API_INTERNAL_URL points at the container name.
ENV API_INTERNAL_URL=http://api:4000
CMD ["pnpm", "exec", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
