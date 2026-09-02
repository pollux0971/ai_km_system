# contracts/openapi/__checks__

Typecheck-only gates for the contracts in `contracts/openapi/`. Nothing here
ships, is bundled, or is executed — these files exist so that a contract
cannot drift away from the shapes its consumers already depend on without
something going red.

Introduced by **E04-S038** (Functional AC2).

## What `conversations-compat.ts` proves

It imports the **real** frontend types (`apps/web/src/lib/conversations.ts`,
`messages.ts`, `answer-state.ts`, `knowledge-scopes.ts`, `ai-models.ts`) — not
a hand-copied mirror — and asserts, at compile time, that:

- the contract's `ConversationMode`, `AiModel`, `KnowledgeScope`,
  `AnswerState`, `AnswerFeedbackVerdict` and `FeedbackReason` enums are
  **exactly** the frontend unions (a merely *narrower* contract would make
  values the UI can already produce unrepresentable, so assignability alone is
  not enough here);
- `Conversation`, `ConversationListPage` and `Message` are assignable to
  `ConversationSummary`, `ConversationListPage` and `Message`;
- no request or entity schema carries an owner-naming field
  (`userId` / `ownerKey` / `ownerId` / `owner`) — the Security AC that
  ownership is decided server-side from the session.

## What `auth-compat.ts` proves

Introduced by **E02-S031**. Against the real `@ai-km/auth-client` types:

- the contract's `AuthSession` is assignable to the client's `AuthSession`,
  both fully populated and with only its required fields;
- `AuthErrorCode` is **exactly** the client's union — narrower would make a
  failure the client already handles unrepresentable, wider would leave it an
  unhandled branch;
- no response schema can carry a session token
  (`token` / `sessionToken` / `accessToken` / `sessionId`), and `LoginRequest`
  cannot name a `userId` / `ownerKey` / `roles`. Identity is what the server
  derives from credentials, never what the caller asserts.

## What `embedding-compat.ts` and `generation-compat.ts` prove

Added by the **2026-09-02 assignment** (`services/rag-skeleton`). Against the
real provider types in `services/rag-skeleton/src/` — not hand-copied mirrors.
Both are **policy L0** evidence (static: typecheck only) — shape compatibility
and nothing else. No provider is involved, so neither carries a Provider
Fidelity (PF) tag; see `services/rag-skeleton/src/evidence-tier.ts` for why the
two axes are named apart.

`embedding-compat.ts`:

- the contract's `input` covers what `EmbeddingProvider.embed()` sends, and
  `dimensions` / `data[].index` are **required** — a response missing
  `dimensions` would force the store to infer dimensionality from whichever
  vector arrived first, which turns a re-index event into silently wrong
  rankings instead of a loud failure;
- `Embedding` (a `Float32Array`) is **deliberately not assignable** to the
  wire's `number[]`. `JSON.stringify(new Float32Array([1, 2]))` yields
  `{"0":1,"1":2}` — an object, not an array — which deserialises to a
  zero-length vector that scores 0 against everything and reads as "no
  matching documents". The explicit `Array.from` at the boundary is
  contractual, and this assertion goes red if the wire type is ever widened to
  accept the typed array directly;
- neither request nor response can carry a credential
  (`token` / `sessionToken` / `accessToken` / `sessionId` / `apiKey`) —
  credentials belong in the `ai_km_session` cookie, not in a body that gets
  logged — nor a principal or scope. The embedding model is not an
  authorization boundary.

`generation-compat.ts`:

- the contract's `Citation` is **exactly** the pipeline's `Citation`, and
  `citations` is required, not optional — an answer that may legitimately omit
  the field is indistinguishable at the type level from an ungrounded one;
- **`ContextChunk` carries no `scopeKey`**, though `RetrievalHit` does. Scope
  is spent before context is assembled (鐵律 #2); sending it onward would put
  department identifiers into a model prompt and invite a future
  implementation to treat generation as a filtering point. Note that
  TypeScript will *not* catch the corresponding mistake on its own:
  `RetrievalHit` is structurally assignable to `ContextChunk`, and
  excess-property checking only fires on object literals, so
  `JSON.stringify(hits)` compiles cleanly and puts `scopeKey` on the wire. An
  L2 HTTP client must project field by field;
- a `Citation` cannot carry `text` / `answer` / `content` / `snippet`. A
  citation that carried its own text could quote something the document does
  not say, and the offsets — the only thing the UI can check against the
  source — would stop being load-bearing.

### The fakes are bound to the same generated types

`services/rag-skeleton/testing/fake-embedding-server.ts` and
`fake-generation-server.ts` `import type` the **same**
`generated/embedding.d.ts` / `generated/generation.d.ts` these checks use, and
type every payload they write against them. `fake-generation-server.ts`
previously declared its own hand-copied `ContextChunk`; that mirror is gone.

This is the point of the exercise. A fake that is not bound to the contract
evolves separately from the real implementation, both stay internally
consistent, and the seam between them is never checked — 「各自驗證正確、
接縫沒被驗證」. Verified by changing `dimensions` to `dims` in
`embedding.yaml`: `embedding-compat.ts` **and** the fake server's own
`pnpm --filter @ai-km/rag-skeleton typecheck` both went red off that single
edit, and both went green again on revert.

## Running it

```bash
# 1. regenerate the types from each contract
pnpm --filter @ai-km/api-client exec openapi-typescript \
  ../../contracts/openapi/conversations.yaml \
  -o ../../contracts/openapi/__checks__/generated/conversations.d.ts
pnpm --filter @ai-km/api-client exec openapi-typescript \
  ../../contracts/openapi/auth.yaml \
  -o ../../contracts/openapi/__checks__/generated/auth.d.ts
pnpm --filter @ai-km/api-client exec openapi-typescript \
  ../../contracts/openapi/embedding.yaml \
  -o ../../contracts/openapi/__checks__/generated/embedding.d.ts
pnpm --filter @ai-km/api-client exec openapi-typescript \
  ../../contracts/openapi/generation.yaml \
  -o ../../contracts/openapi/__checks__/generated/generation.d.ts

# 2. the gate itself
./node_modules/.bin/tsc -p contracts/openapi/__checks__/tsconfig.json --noEmit

# 2b. THE GATE, as a command with an exit code (preferred — use this)
pnpm contract-gate

# 3. spec lint (0 errors required)
pnpm --package=@redocly/cli@1.25.11 dlx redocly lint \
  contracts/openapi/conversations.yaml contracts/openapi/auth.yaml \
  contracts/openapi/embedding.yaml contracts/openapi/generation.yaml
```

## Use `pnpm contract-gate`, not a hand-typed error count

`run-gate.mjs` runs step 2 and applies three independent rules — any one of
them failing fails the whole gate:

1. **No error in any `*-compat.ts` file.** An error there means a contract
   and the code it describes have genuinely diverged.
2. **Every file in the type closure sits under an allowed root** — see
   `closure-allowlist.mjs`. This is deliberately an allowlist, not "no file
   under `apps/`": a denylist blocks only the one disease already found
   (below); an allowlist also blocks `tools/`, `tests/`, and any future entry
   point nobody has thought of, while still letting legitimate closure growth
   (e.g. `@types/node`, pulled in because `services/conversation` genuinely
   needs `better-sqlite3`'s types) through without complaint.
3. **Every UNBOUND contract schema is covered by a class in
   `unbound-schema-allowlist.mjs`.** `binding-coverage.mjs` enumerates every
   schema each `contracts/openapi/*.yaml` declares and classifies each into
   one of four states — **BOUND-L0** (a `*-compat.ts` ties it to an
   implementation type at typecheck time), **BOUND-L2** (a route registers
   it into Fastify's own runtime validator via a literal
   `getSchema("<spec>", "<Schema>")` — see `l2-registrations.mjs`),
   **TRANSCRIBED** (a route hand-writes a schema literal copied from the
   contract instead of fetching it — see `transcribed-schemas.mjs`), or
   **UNBOUND** (none of the above) — plus a fifth, informational-only state,
   **BOUND-VIA-PARENT** (never checked on its own, but `$ref`'d as a field of
   a schema whose own BOUND-L0 check exercises that exact field). Only
   UNBOUND schemas need an allowlist entry; BOUND-L2 and TRANSCRIBED are
   real, distinct gates, not consolation prizes for missing BOUND-L0 — see
   "2026-09-02 correction: L0 is not the only gate" below for why that
   distinction was added and what it changed.

It exits 1 if any rule fails, 0 otherwise, and prints the size of the type
closure and the full BOUND/UNBOUND listing on every run.

Rule 1 used to be "tsc must report exactly 6 errors", re-typed by each
reviewer. It broke the first time it was load-bearing: E04-S060 repointed an
import in an unrelated package at a barrel that also exports a Fastify plugin,
Fastify pulled in ajv, ajv pulled in `@types/node`, `process` became
resolvable, and the six pre-existing `TS2591` errors vanished — with identical
sources on both sides, verified by md5. The count measures the size of the type
closure, not contract drift. A gate whose pass condition is another module's
export list is not a gate.

The closure size is printed because it is now known to move: 97 files before
E04-S060, 202 after E04-S069's repoint (see docs/stories/PROGRESS.md's
E04-S065 row). Watching that number is how the next person catches the same
kind of thing recurring; **rule 2 is what actually catches it** — a numeric
ceiling was considered and rejected because E04-S069 grew the closure while
fixing a real problem, which a ceiling would have flagged as a regression.

`generated/` is committed so a reviewer can run step 2 without step 1, and so
that a contract change that breaks compatibility shows up as a reviewable
diff rather than only as a local failure.

## Wired into CI

**E04-S065** (front half) registered `pnpm contract-gate` as its own
`contract-gate` job in `.github/workflows/ci.yml`, independent of
`lint-typecheck-unit` and `e2e`, so a contract/implementation divergence is
visible on its own rather than buried inside a single `build` job's failure.

## History: step 2 used to be red on pre-existing files (5-xi, now closed by rule 2)

Between 2026-09-02's `services/rag-skeleton` skeleton and E04-S064 retiring
it, `tsc -p contracts/openapi/__checks__/tsconfig.json` intermittently exited
2 with **6** `TS2591: Cannot find name 'process'` errors, all in
`apps/web/src/lib/{api,conversations,feature-flags}.ts` and
`apps/admin/src/lib/api.ts`, reached transitively from the old
`conversations-compat.ts` (which then imported those `apps/web` modules
directly for their real runtime types). See ROADMAP_TEMP.md §5-xi for the
full history, including the closing evidence that the six errors were
**masked**, not fixed, by an unrelated barrel export change, then reappeared
once that export shrank back.

**E04-S069 repointed `conversations-compat.ts` at the seam body
(`services/conversation/src/repository/*.repository.ts`) instead of the
frontend**, which removed the `apps/web` import chain entirely — the current
closure (202 files, checked 2026-09-02) contains zero files under `apps/`.
Rule 2's allowlist (this story, E04-S065 back half) now makes that a checked
invariant instead of an incidental fact: an `apps/` file re-entering the
closure fails the gate immediately, printing the offending path.

## Known: binding coverage found more UNBOUND schemas than ChangeEvent (2026-09-02, E04-S065 back half)

Running `binding-coverage.mjs` for the first time against every existing
`*-compat.ts` found **61 UNBOUND schemas beyond the seeded `ChangeEvent`**,
across every contract that has a compat file, plus two contracts with none:

- `core.yaml` has **no compat file at all** — its `Error`/`Pagination`
  schemas (the platform-wide envelope, consumed via `$ref` from every other
  contract) are never bound to anything by name.
- `transcriptions.yaml` (frozen by E12-S029) has **no compat file at all** —
  all 12 of its schemas are unbound.
- Every other contract's request schemas (`LoginRequest`,
  `CreateConversationRequest`, `GenerationRequest`, ...) and error-envelope
  `*Body`/`*ErrorBody` schemas are unbound in the same structural way
  `ChangeEvent` is: referenced only in a self-check (`OwnerFree`,
  `FlatEnvelope`, a literal `Exact<..., "SOME_CODE">`) that inspects the
  contract's own shape but never ties it to an implementation type.
  `embedding-compat.ts`'s `EmbeddingRequest` is the one existing
  counterexample — bound via `requestSatisfiesGateway: EmbedRequest =
  requestSample` — which is why these are reported as gaps rather than
  treated as inherently unbindable-by-design: the pattern is possible, it
  just was not done for every schema when each compat file was written.

**Left unresolved on purpose, per this story's instructions**: adding a
one-line reason to `unbound-schema-allowlist.mjs` for each of the 61 without
real triage would defeat the entire point of this check. They are reported —
in `docs/stories/PROGRESS.md`'s E04-S065 row and the story's own report — not
silently allowlisted. `pnpm contract-gate` is RED on this account until each
one is either bound, or reviewed and allowlisted with a real reason and
escalation reference by whoever owns that judgment call.

## 2026-09-02 correction: L0 is not the only gate

The section above was this gate's FIRST measurement, and it over-reported:
counting "no BOUND-L0" as "no gate at all" repeats the exact conflation this
whole story exists to remove. Two corrections, both measured against the
real repo, not argued:

1. **BOUND-L2 exists.** Some routes register a yaml schema directly into
   Fastify via `app.contracts.getSchema("<spec>", "<Schema>")`, which
   validates every real request against it at runtime — a stronger gate than
   an L0 type comparison, not a weaker one. Exactly **4 real schemas** are
   registered this way (excluding `apps/api/src/contracts.test.ts`'s own
   `"sample"`/`"nope"` mechanism fixtures, which are filtered out for free
   because neither is a real contract file name): `analytics.yaml`'s
   `UsageEventInput`, and `conversations.yaml`'s `Conversation`,
   `CreateMessageRequest`, and `NotFoundErrorBody`.
2. **TRANSCRIBED exists — a fourth state, not a synonym for UNBOUND.**
   Several routes in `services/conversation` and `services/feedback`
   hand-write their schema as an object literal copied from the yaml instead
   of calling `getSchema`. Ten such constants exist across those two
   services' route files; six of them (all named `*_BODY_SCHEMA`) derive a
   real contract schema name and are classified TRANSCRIBED —
   `conversations.yaml`'s `CreateConversationRequest`,
   `UpdateConversationRequest`, `CreateRevisionRequest`, `SetFeedbackRequest`,
   `SetFeedbackReasonRequest`, `SetFeedbackCommentRequest`. The other four
   (`*_QUERYSTRING_SCHEMA`) describe inline `parameters:` with no
   `components.schemas` entry to transcribe FROM at all, and are correctly
   left unmatched — see `transcribed-schemas.mjs`'s header for why deriving
   a name from those four would produce a real false positive
   (`USAGE_METRICS_QUERYSTRING_SCHEMA` -> `UsageMetrics`, which collides with
   `analytics.yaml`'s actual, unrelated `UsageMetrics` schema). A transcribed
   schema is a real, live-validated copy of the contract with nothing
   comparing the two — not equivalent to a real binding, but not equivalent
   to no gate at all either, which is why it is its own state rather than
   folded into BOUND or UNBOUND. TRANSCRIBED is printed on every run and is
   never allowlist-eligible; its unlock condition is the same for all six:
   **"reclassified to MATCH or DIVERGES once the L2-EQ check lands"** — a
   follow-up story (not yet numbered) that will compare each registered or
   transcribed route schema against its yaml at runtime-registration time,
   closing the one thing this story's L2/TRANSCRIBED detection deliberately
   does not do.

After both corrections, the count moved from 62 UNBOUND (61 plus the seeded
`ChangeEvent`) to **52** — a real but modest drop, not the headline of this
correction. `pnpm contract-gate` is GREEN as of this correction:
`unbound-schema-allowlist.mjs` now has **6 classes** (not 52 individual
entries) covering every one of those 52, each with a reason, an escalation
reference, and a concrete unlock condition — see that file for the full
list. The report is also now split into two sections, printed by
`run-gate.mjs` on every run: **contract-level gaps** (`core.yaml` and
`transcriptions.yaml` have no compat file, no BOUND-L2, and no TRANSCRIBED
for ANY of their schemas — a categorically bigger gap than one schema inside
an otherwise-covered contract) and **schema-level gaps** (grouped by class,
inside contracts that ARE otherwise gated). "This contract has no gate" and
"this one schema in a gated contract is unbound" are different severities
and are never merged into one list.

