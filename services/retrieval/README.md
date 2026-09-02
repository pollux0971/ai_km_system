# services/retrieval

Owner: **Team B** — E04 RAG & Conversation Intelligence.

Authorized retrieval + reranking + citation mapping. Enforces
Authorization-Before-Retrieval.

## Reranking (E04-S016 — Basic tier)

`SOURCE_BASELINE.md` §17: E04-S16 is MVP = Basic, GA = Dedicated reranker.
**MMR (Maximal Marginal Relevance) is the default Basic implementation,
adjustable** (user decision, 2026-09-02) — a proposal, not a settled answer.
See `src/rerank/mmr.ts` for the algorithm and `DEFAULT_MMR_LAMBDA`'s docstring
for why `0.5` is provisional and awaiting a user ruling (registered `(d5)`).

Reranking is a separate, explicitly-composed step (`retrieveWithReranking` in
`src/rerank/retrieve-with-reranking.ts`), NOT baked into `retrieve()` —
`retrieve()`'s existing contract (best-first by the store's own score) is
frozen by `service.test.ts`'s AC-R1 and stays untouched. Reranking always
operates on results `retrieve()` already scope-filtered; it may reorder or
drop, never insert or widen the authorized set.
