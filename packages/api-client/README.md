# @ai-km/api-client

Typed HTTP client generated from `contracts/openapi/*.yaml`. This is the only way
`apps/web`, `apps/admin`, and any BFF route handler are allowed to reach `apps/api`
(CLAUDE.md 鐵律 3) — never a raw `fetch`/DB/vector-store call.

## Regenerating types

```
pnpm --filter @ai-km/api-client generate
```

Reads every spec under `contracts/openapi/{core,auth,conversations,transcriptions}.yaml`
and (re)writes the matching `src/generated/<name>.d.ts`. A spec that doesn't exist yet is
skipped with a warning — the command still exits 0, so a partially-frozen contract set
never blocks other packages.

**The output is committed.** Never hand-edit anything under `src/generated/` — always
change the spec and re-run `generate`.

```
pnpm --filter @ai-km/api-client check
```

Regenerates and then fails (non-zero exit, diff printed) if `src/generated/*` doesn't
match what's committed. This is the L2 contract-drift gate; `turbo test` runs it first
(see `turbo.json`'s `test.dependsOn`), so a stale generated file turns the whole test
run red instead of silently passing.

## Using the client

```ts
import { createApiClient, toResult } from "@ai-km/api-client";

const client = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1" });

const result = await toResult(client.conversations.GET("/conversations", { params: { query: { page: 1 } } }));
if (!result.ok) {
  // result.error: { code, message, details? } — a stable ApiError from @ai-km/types.
  // result.error.code === "UNAUTHENTICATED" for any 401, regardless of the response body.
  return;
}
result.value; // typed from contracts/openapi/conversations.yaml's response schema
```

- `client` is grouped by spec: `client.core`, `client.auth`, `client.conversations`,
  `client.transcriptions` — each an `openapi-fetch` client typed from that spec's
  generated `paths`. Call it the way you'd call `openapi-fetch` directly
  (`client.conversations.GET("/conversations", { params: {...} })`,
  `client.auth.POST("/auth/login", { body: {...} })`, …).
- **Always route the call through `toResult(...)`** — pass the client call itself
  (don't `await` it first) so `toResult` can also catch network failures and non-JSON
  bodies:
  - 2xx → `{ ok: true, value }`, typed from the spec's response schema.
  - non-2xx with a body matching the shared `Error` envelope (`{code, message, details?}`)
    → `{ ok: false, error }` using the server's `code`.
  - any 401 → `{ ok: false, error: { code: "UNAUTHENTICATED", ... } }`, regardless of the
    response body. Whether to surface that as an error or map it to `null` (e.g.
    "not signed in" is not a failure) is each adapter's call, not this package's.
  - network error / non-JSON body / any other malformed response → `SERVICE_UNAVAILABLE`.
- `createApiClient({ baseUrl, fetch?, clientId? })`:
  - `baseUrl` is required and always supplied by the caller — this package never reads
    `process.env` itself (apps/web passes `NEXT_PUBLIC_API_BASE_URL ?? "/api/v1"`).
  - `fetch` lets tests inject a fake (`(request: Request) => Promise<Response>`).
  - Every request automatically gets `credentials: "include"`, an `x-correlation-id`
    (a fresh v4 uuid unless the caller sets that header explicitly on the call, which
    wins), and an `x-client-id` — one uuid per browser tab, persisted in
    `sessionStorage["ai-km:client-id"]`, letting the server echo `originClientId` on SSE
    events (E04-S044) so the originating tab can skip its own echo.
  - Pass `clientId` explicitly wherever `sessionStorage` isn't available (a BFF route
    handler running server-side) — otherwise a fresh uuid is generated per client
    instance instead of being persisted.
- No raw-fetch escape hatch is exported: the only way to call the API is through the
  spec-typed methods above, so nothing can silently call an endpoint contracts/openapi
  doesn't know about.
