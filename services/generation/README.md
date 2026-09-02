# services/generation

Owner: **Team B** — E04 RAG & Conversation Intelligence / E12 Model & Prompt
Platform. Built by Team A under the 2026-09-02 Wave 1 authorization.

Context builder + generation orchestration sitting in front of the Model
Gateway.

`answer()` never calls a model directly. Baseline §5 rule 28 routes model calls
through the Model Gateway, and ADR 0007 fixes the shape: in-process
`gateway.generate()`, not `POST /v1/generate` over a loopback socket.

It does not re-filter by scope. Authorization is spent by the time context
arrives (鐵律 #2), and a second filter here would be a second place visibility
is decided. It does project `RetrievalHit` to `ContextChunk` field by field —
`RetrievalHit` carries `scopeKey` and `ContextChunk` must not, and TypeScript
cannot catch the mistake: the two are structurally assignable and
excess-property checking only fires on object literals, so `JSON.stringify(hits)`
would compile cleanly and put department identifiers into a model prompt.

A fabricated citation causes the whole response to be refused, not the bad
citation filtered out. A model that fabricates one source has shown it will
fabricate others, and a silently-filtered response looks correct.

When retrieval returns nothing, generation is never called at all — proven by a
test that counts provider invocations rather than inspecting the output. What
that path returns today is free text, which a UI cannot distinguish from a real
answer; making it a structured reason is E04-S022, and its threshold is a
product decision awaiting the user.

Not yet wired into `apps/api` — see E06-S043's precondition.
