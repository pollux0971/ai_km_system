# ADR 0001: Team A BFF logic lives inside apps/web and apps/admin

Status: Accepted (assumption made during monorepo scaffold — needs Team B
sign-off before being relied upon for real story work)

Amendment 2026-08-28: still in force for BFF logic. Separately, the user
assigned Team A a batch of stories that implement a real `apps/api`
(ADR 0003); that is not BFF logic and does not supersede this ADR — the
web/admin apps keep calling `apps/api` only through `@ai-km/api-client`, and
`/api/v1/*` in the Next apps is a rewrite (proxy), not a Route Handler.

## Context

`SOURCE_BASELINE.md` and `readme_zh.md` state Team A "可以建立 Mock Server、
Contract-compatible Mock 或 BFF 來避免等待 Team B，但不得繞過 Domain
Service、Authorization 或正式 Contract" — i.e. Team A may build a
Backend-For-Frontend to avoid blocking on Team B, as long as it never
bypasses the real Domain Service, Authorization, or the frozen Contract.

The canonical monorepo layout (`SOURCE_BASELINE.md` §9) lists `apps/web`,
`apps/admin`, `apps/api`, `apps/worker-ingestion`, `apps/worker-rag`,
`apps/worker-sync` — it does **not** list a separate `apps/bff-web` or
similar. `apps/api` is Team B's (hosts the backend surface for
E02/E04/E06/E08/E10/E12/E14).

## Decision

When Team A needs BFF-style logic (aggregating/shaping typed-client calls
for a specific UI need, holding a short-lived server-side session token,
etc.), it lives inside Next.js Route Handlers under `apps/web/src/app/api/*`
or `apps/admin/src/app/api/*` — not as a new top-level app.

This BFF layer may only call the typed client generated from
`contracts/openapi` (via `@ai-km/api-client`) against Team B's real or
mocked services. It must never read the database/vector store directly,
never reimplement authorization, and never call an endpoint that isn't in
the frozen contract.

## Consequences

- No new top-level app is needed for Team A's BFF needs, matching the
  canonical layout exactly.
- Team A's BFF code is co-located with the UI that needs it, reviewed under
  the same PR/story boundary.
- If a genuinely separate BFF process is later needed (e.g. for
  streaming/perf reasons), that would require a new ADR superseding this
  one and agreement from both teams before adding a new `apps/*` entry.
- This was written during initial scaffold, before any real story work —
  treat as a working assumption to confirm with Team B, not a settled
  cross-team agreement yet.
