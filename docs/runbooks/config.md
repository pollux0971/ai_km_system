# Runtime configuration (env vars)

Documents environment variables that change runtime behavior, beyond
what `apps/web/.env.example` already lists inline. New file — created by
E03-S046; extend as later stories add configurable behavior.

## `NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE`

- **Where**: `apps/web` (client-rendered pagination UI, hence the
  `NEXT_PUBLIC_` prefix — Next.js only inlines `NEXT_PUBLIC_*` vars into
  the browser bundle).
- **Read by**: `apps/web/src/lib/conversations.ts`'s `readPageSize()`.
- **Default**: `20` (unset).
- **Valid range**: integer `1`–`200` (`200` is the server's own `pageSize`
  cap — `contracts/openapi/conversations.yaml`). An out-of-range or
  non-integer value falls back to the default and logs a `console.warn`
  naming the invalid value — it never throws or blocks rendering.
- **E2E**: `tests/e2e/playwright.config.ts`'s `web` webServer entry sets
  this to `2` — several existing E2E specs and fixtures (3 seeded
  conversations landing on exactly 2 pages) were designed around the old
  hardcoded value of 2 and depend on it staying that way.
- **Unit tests**: `apps/web/vitest.setup.ts` sets this to `2` for the same
  reason, applied before any test file's own imports evaluate
  `conversations.ts`.
