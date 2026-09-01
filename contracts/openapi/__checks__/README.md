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

`run-gate.mjs` runs step 2 and applies the only rule that means anything here:
**fail if and only if an error lands in a `*-compat.ts` file.** It exits 1 in
that case, 0 otherwise, and prints the size of the type closure on every run.

The rule used to be "tsc must report exactly 6 errors", re-typed by each
reviewer. It broke the first time it was load-bearing: E04-S060 repointed an
import in an unrelated package at a barrel that also exports a Fastify plugin,
Fastify pulled in ajv, ajv pulled in `@types/node`, `process` became
resolvable, and the six pre-existing `TS2591` errors vanished — with identical
sources on both sides, verified by md5. The count measures the size of the type
closure, not contract drift. A gate whose pass condition is another module's
export list is not a gate.

The closure size is printed because it is now known to move: 97 files before
E04-S060, 287 after. Watching that number is how the next person catches the
same thing recurring. Shrinking it back — compat checks importing type-only
entry points rather than whole service barrels — and wiring this command into
CI are **E04-S065**.

`generated/` is committed so a reviewer can run step 2 without step 1, and so
that a contract change that breaks compatibility shows up as a reviewable
diff rather than only as a local failure.

## Not yet wired into CI

E04-S038's development boundary allows `contracts/**` only, so this gate is
not registered in `turbo.json` / the root `package.json` scripts. **E03-S034**
(`@ai-km/api-client` codegen pipeline + drift gate) is the story that owns
that wiring; until it lands, run the commands above by hand.

## Known: step 2 is currently red on pre-existing files

As of 2026-09-02, `tsc -p contracts/openapi/__checks__/tsconfig.json` exits 2
with **6** `TS2591: Cannot find name 'process'` errors, all in
`apps/web/src/lib/{api,conversations,feature-flags}.ts` and
`apps/admin/src/lib/api.ts`, reached transitively from
`conversations-compat.ts`. The cause is this directory's own
`tsconfig.json`, which sets `"types": []` while the frontend modules it pulls
in read `process.env`.

This predates the 2026-09-02 contracts — verified by running the gate with
`embedding-compat.ts` / `generation-compat.ts` / their generated `.d.ts`
removed, which produces the same 6 errors. None of the four `*-compat.ts`
files themselves error. Because the gate is not wired into CI (see above),
nothing was reporting this.

Left unfixed on purpose: the fix touches this gate's shared `tsconfig.json`,
which is outside the 2026-09-02 assignment's scope.
