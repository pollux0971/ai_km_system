# ADR 0002: Vitest is the unit/component test runtime for Team A frontend code

Status: Accepted (Team A-internal tooling choice; does not require Team B
review — no cross-team interface is affected)

## Context

`packages/testing/src/index.ts` was deliberately scaffolded without a test
runner wired in, with a comment deferring the choice to "the first story
that needs it." E01-S001 is that story: its Test Obligations require unit
tests (middleware correlation-id logic, route-skeleton components), and no
package in the workspace had a working `test` script yet (`pnpm test` only
ran the `@ai-km/e2e` Playwright suite).

Candidates considered: Jest (via `next/jest`) vs. Vitest.

## Decision

Use **Vitest** (`environment: "jsdom"`, `@testing-library/react`,
`@testing-library/jest-dom`) as the unit/component test runtime for Team A
apps (`apps/web`, and `apps/admin` when it needs one). Server-only modules
(e.g. Next.js middleware) override to `// @vitest-environment node` per
file rather than splitting into a second project/config.

Rationale: native ESM/TS support with no transform config beyond a single
`vitest.config.ts`, faster watch/run loop than `next/jest`, and every
workspace package already resolves `"main"` to TypeScript source
(`./src/index.ts`) rather than a build output — Vite's transform pipeline
handles that directly without an extra compile step.

Each package that needs it adds its own `vitest.config.ts` and `test`
script (`vitest run`) rather than a single root config, matching the
existing per-package `typecheck`/`lint`/`build` script pattern that Turbo
already orchestrates.

## Consequences

- Team A stories going forward write unit/component tests with Vitest +
  Testing Library; this is now the established pattern to follow, not a
  per-story decision.
- `pnpm-workspace.yaml`'s `allowBuilds` needed `esbuild: true` (transitive
  Vite/Vitest dependency whose install script only fetches a
  platform-specific binary) — was previously an unset placeholder.
- Team B packages (services/*, apps/api, workers) are unaffected and free
  to choose their own runtime for backend code; this ADR only binds
  Team A's frontend/BFF code under `apps/*` (web, admin) and shared
  `packages/*` that Team A owns test coverage for.
- If a future story needs cross-package shared test setup (e.g. a common
  provider-wrapping render helper), it belongs in `packages/testing`,
  extending — not replacing — this runtime choice.
