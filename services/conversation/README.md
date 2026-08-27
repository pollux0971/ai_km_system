# services/conversation

Owner: **Team B** — E04 RAG & Conversation Intelligence.

Conversation orchestration domain service (query understanding, session
state). Not yet scaffolded.

**2026-08-28:** the user assigned Team A E04-S038～S044
(`@ai-km/service-conversation`: conversations/messages/feedback REST,
change-event log + SSE stream, dev seeds) — see
`docs/adr/0003-api-runtime-sqlite-sse.md`. Generation stays a frontend mock
until E04's real RAG pipeline (Team B) lands; the transitional
`POST messages role=assistant` allowance is documented in the contract.
