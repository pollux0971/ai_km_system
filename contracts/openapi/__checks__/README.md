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
3. **Every UNBOUND contract schema is in `unbound-schema-allowlist.mjs`.**
   `binding-coverage.mjs` enumerates every schema each `contracts/openapi/
   *.yaml` declares and determines, from the `*-compat.ts` file's actual
   TypeScript AST (not a regex over import names), whether it is tied to a
   real implementation type. A schema that's UNBOUND and not listed there
   fails the gate. See "Known: binding coverage" below — this is currently
   red.

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
