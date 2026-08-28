# E01-S028 — apps/admin, on-prem deploy image.
# Build from the REPO ROOT: `docker build -f infra/docker/admin.Dockerfile .`
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
EXPOSE 3001
WORKDIR /repo/apps/admin
# apps/admin has no server-side API rewrite yet (unlike apps/web's
# next.config.ts) — that wiring is E11-S026 (SOFT dependency, not yet
# merged as of this story). Nothing here reads an API_INTERNAL_URL-style
# var today; deliberately not setting one that would silently do nothing.
CMD ["pnpm", "exec", "next", "start", "-p", "3001", "-H", "0.0.0.0"]
