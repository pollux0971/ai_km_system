# services/retrieval

Owner: **Team B** — E04 RAG & Conversation Intelligence.
Built by Team A under the 2026-09-02 Wave 1 authorization.

Authorized retrieval + reranking + citation mapping. Enforces
Authorization-Before-Retrieval.

## Scope is an input, never derived here

`retrieve(question, scope, topK)` takes a `RetrievalScope` and never derives
one. Deriving it here would make this service an authorization boundary, and
"which departments may this person read" would then have two answers — this one
and E02's. E04-S009 owns the single answer and is `blocked-team-b` until E02
RBAC exists. The scope type is branded, so forgetting to thread authorization
through is a compile error rather than a runtime surprise.

## Deny-Wins is enforced twice, deliberately

The store pushes the scope predicate into the candidate scan, so unauthorized
rows are never scored; `assertNoScopeLeak` re-checks results on the way out. In
`sqlite-vec` the first half is a vec0 PARTITION KEY, so authorization runs
*inside* the KNN search. An earlier JOIN-after-KNN shape returned `[]` to
authorized users whose chunks had been crowded out of the global top-k — no
leak, but a silent total recall failure — and `AC-V6` exists so that shape
cannot come back.

Re-ingesting a document under a different `scopeKey` is refused
(`DOCUMENT_SCOPE_CONFLICT`, E06-S043); same-scope re-ingest replaces the
document's chunks atomically, so a shorter new version cannot leave surplus
chunks behind for citations to point at.

## Reranking (E04-S016 — Basic tier)

`SOURCE_BASELINE.md` §17: E04-S16 is MVP = Basic, GA = Dedicated reranker.
**MMR (Maximal Marginal Relevance) is the default Basic implementation,
adjustable** (user decision, 2026-09-02) — a proposal, not a settled answer.
See `src/rerank/mmr.ts` for the algorithm and `DEFAULT_MMR_LAMBDA`'s docstring
for why `0.5` is provisional and awaiting a user ruling (registered `(d5)`).

Reranking is a separate, explicitly-composed step (`retrieveWithReranking` in
`src/rerank/retrieve-with-reranking.ts`), NOT baked into `retrieve()` —
`retrieve()`'s contract promises best-first by the store's own score, MMR breaks
that promise by design, and `service.test.ts`'s AC-R1 freezes it. Reranking
always operates on results `retrieve()` already scope-filtered; it may reorder
or drop, never insert or widen the authorized set.

It is handed strictly more candidates than `topK` — given only `topK` it would
have nothing to diversify among and would silently do nothing.

On the `sqlite-vec` store it currently throws `RerankError` at lambda < 1,
because that store does not yet return `embedding` on a hit (**E04-S067**, which
must land before any composition root wires sqlite-vec into `retrieve()`).
Throwing rather than quietly returning the un-reranked list is the point.

Not yet wired into `apps/api` — see E06-S043's precondition.
