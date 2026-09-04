# `@ai-km/contract-equivalence` — L2-EQ (E04-S073)

Verifies that **the schema Fastify actually uses to validate a request
equals the frozen OpenAPI contract**. This is a third, distinct thing from
two checks that already exist in this repo:

| | compares | when |
|---|---|---|
| **L0** (`contracts/openapi/__checks__`) | generated TypeScript types vs implementation types | compile time |
| **L2** (`binding-coverage.mjs`) | "is this schema fetched from the contract by name at all?" | registration time, structural |
| **L2-EQ** (this package) | the runtime validator's ACTUAL schema vs the contract's ACTUAL schema, field by field | registration time, against a live `buildServer()` |

Neither L0 nor L2 can see a **transcription** drift: a route that
hand-copies a JSON Schema object literal out of the yaml once, at write
time, has "a gate" in L2's sense (Fastify does validate real requests
against it) but nothing ever compares that literal back to the yaml again.
A copy can drift from its contract while L0 and L2 both stay green. L2-EQ
closes exactly that gap by diffing the two schemas directly, at runtime,
against the real registered route.

## How it works

`src/check.live.test.ts` builds the REAL `apps/api` server (real
`contracts/openapi/*.yaml`, every real domain plugin) with the `fastify`
package mocked so an `onRoute` hook (`collect-routes.ts`) is attached the
instant the Fastify instance is constructed — before `server.ts` registers
a single plugin. `onRoute` is not encapsulated, so a hook attached at that
point observes every route registered anywhere in the app afterwards. See
`collect-routes.ts`'s module doc for why `buildServer()`'s own
`testExtraPlugin` extension point is too late for this (it registers after
every domain plugin already has).

For each collected route, its Fastify path (`:id`) is converted to the
OpenAPI path style (`{id}`) and matched to a yaml operation by path+method
(`path-match.ts`). The yaml side's `$ref`s are already fully resolved
(`load-contracts.ts` dereferences every spec once at load time), and a
querystring/path-params comparison target is synthesised from the
operation's `parameters:` array, since OpenAPI has no named-component
`$ref` target for "the set of query parameters" (`synthesize.ts`). Both
sides are normalised and deep-diffed (`normalize.ts`) and the result is
printed per route as **MATCH** / **DIVERGES** (with the diff) / **ABSENT**
(one side declares a schema the other doesn't — printed in whichever
direction it occurs, including a yaml operation with no matching route and
a route with no matching yaml operation).

`apps/api` is never modified. Only the `fastify` module `server.ts` imports
is wrapped, and the wrap delegates every call to the real, unmodified
`fastify` factory.

## How to run it

```
pnpm --filter @ai-km/contract-equivalence exec vitest run src/check.live.test.ts
```

This prints the full MATCH/DIVERGES/ABSENT report to stdout and then
asserts zero DIVERGES. As of E04-S081 (2026-09-03) this **passes**: the two
DIVERGES that used to fail this assertion are resolved — see "Historical
DIVERGES (resolved by E04-S081)" below. This exact test (filtered by `-t`)
is also what `contract-gate`'s "route-schema (gated)" section runs — see
"Both sections are gated" below; running it here manually behaves
identically, it is just not wrapped in `contract-gate`'s own headings.

Unit tests for the normalisation/diff/path-matching/synthesis logic itself
(pure, no real server) run the same way:

```
pnpm --filter @ai-km/contract-equivalence exec vitest run
```

## Both sections are gated (2026-09-03, E04-S082 — supersedes the split below)

**This package is fully gated.** `pnpm contract-gate`
(`contracts/openapi/__checks__/run-gate.mjs`) runs both live checks below
on every invocation, prints each under its own heading, and a non-zero
exit from *either* heading now fails the gate:

- **`response-shape (gated)`** — runs `check-response-shapes.live.test.ts`
  (E04-S079). Gated since 2026-09-03 (E04-S073 follow-up, "gate-response-shape").
- **`route-schema (gated)`** — runs the one `check.live.test.ts` test that
  produces the full MATCH/DIVERGES/ABSENT report (E04-S073). Gated since
  2026-09-03 (E04-S082): E04-S081 resolved both of its DIVERGES by adding
  the missing `default`s to `analytics.yaml` (see "Historical DIVERGES
  (resolved by E04-S081)" below), so the reason this half was left
  unenforced no longer applies. Its full report — ABSENT included — is
  still printed every run; ABSENT never fails it (see below).

**ABSENT is not, and by construction cannot be, gated.** 15 of the 26
routes report ABSENT — overwhelmingly because no route in this application
registers a Fastify `params:` or `response:` schema at all (tracked as
E04-S077 and E04-S079's follow-on authorization requests, both
`blocked-team-b`). `divergedRoutes()` (`print-report.ts`) filters strictly
on `status === "DIVERGES"`, so gating this check's exit code cannot turn an
ABSENT route red. Gating ABSENT would make `main` permanently red on
someone else's unanswered authorization question — exactly what the
observed-only landing below existed to prevent.

### History: the two-sections split (2026-09-03, E04-S073 follow-up, superseded above)

Between 2026-09-03's "gate-response-shape" follow-up and E04-S082 later the
same day, this package was **half gated**: `response-shape` gated,
`route-schema` still observed-only. E04-S073's original landing constraint
(further below, kept for history) said L2-EQ must not be wired into any
gate until the user decided on its DIVERGES; the user's technical advisor
ruled that constraint attaches to **whichever check still carries an
unresolved finding**, not to `tools/contract-equivalence/` as a whole —
`route-schema` still had two real, unresolved DIVERGES at that point (see
"Historical DIVERGES" below), while `response-shape` had zero. E04-S081
resolved those two DIVERGES the same day, which is what let E04-S082 gate
the remaining half.

### Original landing constraint (2026-09-02, E04-S073, superseded above in full since E04-S082)

This package originally defined **no `"test"` script** in `package.json`
(only `"typecheck"`), so `pnpm turbo run test` never touches it, and no
script here was named `"build"`, `"lint"` or `"check"` either (turbo's own
`"check"`/`"build"` tasks would otherwise fire for this package as a
dependency of a `"test"` task it doesn't have anyway — see `turbo.json`).
That remains true today — nothing here gained a `package.json` script;
`run-gate.mjs` invokes `vitest` directly against this package's own
`node_modules/.bin/vitest`, the same way `tools/mutate.mjs` does, so
`turbo run test` still never touches this package.

The original reasoning governed the route-schema half until E04-S081
resolved its DIVERGES: **a real DIVERGES may never enter an allowlist, and
must never be silently made to pass** — the user had to see the full
DIVERGES list and decide first, rather than a gate being wired in ahead of
that decision (which would either break the build over findings nobody had
approved fixing, or invite the gate being loosened to get back to green —
worse than no gate at all). Running it as an observed-only section was
that resolution while the DIVERGES stood: its output was never hidden and
its red was never bypassed. That is no longer the live state — see "Both
sections are gated" above — but the reasoning is kept here because the
same shape of decision (gate now, or observe until a real answer lands)
will recur.

## Historical DIVERGES (found 2026-09-02, resolved 2026-09-03 by E04-S081)

Two real, explained divergences existed from `check.live.test.ts`'s first
run until E04-S081 — not normalisation gaps, not bugs in this tool. The
user's technical advisor authorized adding the defaults to
`analytics.yaml` (`archive/stories/PENDING_DECISIONS.md`'s now-resolved
entry), and E04-S081 landed that on 2026-09-03; `pnpm --filter
@ai-km/contract-equivalence exec vitest run src/check.live.test.ts` now
reports `SUMMARY: 26 total — MATCH=11 DIVERGES=0 ABSENT=15`. Kept below for
the historical record of what the two divergences were:

- **`GET /v1/admin/metrics/latency`** — `analytics.yaml`'s `days` query
  parameter carries no `default` ("Implementation decides the default —
  this contract only freezes the response shape," per the yaml's own
  description); `services/feedback/src/routes/admin-metrics.ts`'s
  `LATENCY_METRICS_QUERYSTRING_SCHEMA` adds `default: 7`. The contract
  explicitly permits this, but it is still a real structural difference
  between the two schemas, so it is reported rather than quietly matched.
- **`GET /v1/admin/feedback`** — `analytics.yaml`'s `page`/`pageSize` query
  parameters carry no `default` (no comment explaining why, unlike the
  `days` case above); `admin-feedback.ts`'s
  `LIST_FEEDBACK_QUERYSTRING_SCHEMA` adds `default: 1` / `default: 20`.

Also found, not previously tracked anywhere: **`POST /v1/auth/login`**'s
`services/identity/src/plugin.ts`'s `LOGIN_REQUEST_SCHEMA` is an 11th
hand-transcribed schema (`auth.yaml`'s `LoginRequest`) beyond the 10 named
in this story's own PROGRESS.md row — found because this tool reads actual
registered schemas via `onRoute`, not a `*_BODY_SCHEMA` naming convention.
It matches the contract in full (the one real difference, `format:
password`, is normalised away — see `normalize.ts`'s module doc for the
verified, narrow reason `password` specifically is inert under
`ajv-formats`).

Every one of the 10 originally-named transcriptions
(`CREATE_REVISION_BODY_SCHEMA`, `CREATE_CONVERSATION_BODY_SCHEMA`,
`UPDATE_CONVERSATION_BODY_SCHEMA`, `SET_FEEDBACK_BODY_SCHEMA`,
`SET_FEEDBACK_REASON_BODY_SCHEMA`, `SET_FEEDBACK_COMMENT_BODY_SCHEMA`,
`LIST_QUERYSTRING_SCHEMA`, `USAGE_METRICS_QUERYSTRING_SCHEMA`,
`LIST_FEEDBACK_QUERYSTRING_SCHEMA`) was a full **MATCH** except the two
querystring defaults named above — and since E04-S081 added those defaults
to `analytics.yaml`, all 10 are now full MATCH with no exception. The one
route that already pulls its schema live from the contract
(`CreateMessageRequest`, via `getSchema()`) is also a MATCH — a useful
sanity check that this tool isn't trivially green everywhere.

Also surfaced (informational, does not affect any route's MATCH/DIVERGES
verdict — see `RouteReport.responseFields`'s doc comment in
`build-report.ts`): **zero routes in this app register a Fastify
`response` schema at all**, and every path parameter (`conversationId`,
`messageId`, `citationId`, ...) is read via an untyped cast rather than a
Fastify `params` schema — both pre-existing, application-wide facts, not
new findings of this story.

## Normalisation rules (see `normalize.ts` module doc for the full reasoning)

1. Strip `description`/`title`/`examples`/`example`/`x-*` — documentation,
   zero effect on validation.
2. Sort `required` arrays before comparing — it's a set, not a sequence.
3. Sort `enum` arrays before comparing — same reasoning.
4. (Asymmetric, querystring-only) contract omitting `additionalProperties`
   + runtime declaring `false` is not flagged — no OpenAPI `parameters:`
   field carries this key at all, so without this rule EVERY synthesised
   querystring schema would DIVERGES purely from the synthesis method, on
   every route, forever.
5. (One named exception, not a category) `format: "password"` specifically
   is stripped — verified in this repo's own `node_modules` that
   `ajv-formats` defines it as the literal `true` (always-valid), so its
   presence/absence can never change validation behaviour. No other
   `format` value is touched.

**Deliberately NOT normalised**: `default` (a real, contract-vs-runtime
structural difference is reported even where the contract's own prose
allows it — see "Historical DIVERGES" above) and every other `format`
value. A rule that silently equates two genuinely different things is
worse than a false red.

## Stated limitations

- Response-schema comparison only ever looks at 2xx status codes (never a
  non-2xx/Error-envelope variant) — and, empirically, finds nothing to
  compare on the runtime side for any route in this app today (see
  "Historical DIVERGES" above). This is reported as informational
  (`responseFields`), separate from a route's MATCH/DIVERGES verdict, for
  exactly that reason: folding it into `status` would make every route
  read ABSENT regardless of whether its real, load-bearing
  body/querystring transcription is correct — the "everything is red so
  nothing is red" failure mode a status field exists to prevent.
- Path-parameter (`in: path`) comparison is implemented identically to
  querystring, but every route in this app reads path params via an
  untyped cast with no Fastify `params` schema at all, so it currently
  only ever reports ABSENT — accurate, not a bug, and not this story's
  scope to fix.
- Matching is by path+method only; if two different contracts ever
  declared the exact same path+method (none do today — see
  `path-match.ts`), the yaml index would let the second silently overwrite
  the first with no ambiguity warning.

## Actual response SHAPE vs contract (E04-S079)

The schema-vs-schema `response:<status>` field above (E04-S073) can only
ever read ABSENT — there is no runtime `response:` schema anywhere in this
app to diff a contract schema against. `response-instance-diff.ts` +
`check-response-shapes.live.test.ts` answer a narrower, different question
instead: given a REAL 2xx response body a route actually returned (captured
via `app.inject()` against the real `apps/api` server, real login, no
mocks), which fields does it carry that the contract does not document
(potential leak), and which contract-required fields does it omit
(potential broken consumer)?

As of 2026-09-03 this is the check `contract-gate`'s "response-shape
(gated)" section runs on every invocation — a non-zero exit here fails
`contract-gate` (see "Both sections are gated" above). It can still be
run manually the same way, outside `contract-gate`
(this package still defines no `"test"` script, so `pnpm turbo run test`
never touches it directly — `run-gate.mjs` invokes its `vitest` binary
directly, the same way `tools/mutate.mjs` does):

```
pnpm --filter @ai-km/contract-equivalence exec vitest run src/check-response-shapes.live.test.ts
```

**Result as of E04-S079 (2026-09-03): 21 of 21 exercised routes clean** — no
extra fields, no missing fields. See `archive/stories/specs/E04-S079.spec.md`
for the full per-route table, which four routes were not exercised and why,
and whether an existing test would already catch a regression here (for 20
of the 21, yes — an existing `expectResponseMatchesContract`/
`validateAgainstAuthContract` call already runs ajv against the same
`additionalProperties: false` schema on the same status; `GET
/v1/admin/health` is the one exception with no such check today — this is
exactly why the 2026-09-03 reverse-verification mutation for the gate
wiring targets that route: it is the one route where NOTHING else in this
repo would catch a response-shape regression).

See `response-instance-diff.ts`'s own module doc for exactly what this
comparison does and does not check (field presence only, not
types/formats/enums; one representative 2xx branch per route, not every
branch a route can produce; no descent into an `additionalProperties`-only
map).

### Response-shape coverage: three numbers, not a fraction (2026-09-03)

"21 of 21 exercised routes clean" only ever describes the routes this run
reached — a route it never called is invisible to that fraction, not
counted as a zero. That is the same shape of mistake the route-schema side
of this tool made first and had to correct (an early report read
"MATCH=9 DIVERGES=2" without printing that 15 more routes were ABSENT —
see "Historical DIVERGES" above and archive/ROADMAP_TEMP.md 5-rho). This tool does
not get to make that mistake twice.

`check-response-shapes.live.test.ts`'s `beforeAll` now prints, every run,
via `response-shape-coverage.ts`:

- **declared** — every `"METHOD /path"` operation, across every loaded
  contract, that declares at least one `application/json` 2xx response
  (today: **22**).
- **exercised** — how many of those this specific run actually captured
  and diffed (today: **21**).
- **NOT covered** — `declared` minus `exercised`, printed **by name**, not
  folded into a count (today: **1** — `POST /transcriptions`; see this
  file's module doc point 4 for why it is answered by an existing test
  elsewhere instead of being re-exercised here).

An uncovered route is neither a gate failure nor allowlist-eligible: it is
a fact about this run's own reach, not a finding about the route. Adding
it to any allowlist would misrepresent it as a known, accepted gap rather
than "this run's scenario list doesn't reach it (yet)" — a real distinction
this repo's own allowlists (`unbound-schema-allowlist.mjs`,
`undocumented-route-allowlist.ts`) exist to preserve for actual findings,
not for routes nobody has looked at yet.
