# apps/api

Owner: **Team B** (Data & Intelligence Platform).

Hosts the backend API surface for the Team-B-owned domains (E02 Identity/RBAC,
E04 RAG & Conversation Intelligence, E06 Ingestion, E08 Maintenance
Intelligence, E10 Enterprise Data Integration, E12 Model & Prompt Platform,
E14 Audit/Security/Observability). Not yet scaffolded — Team B decides the
concrete framework/language.

Team A does not implement here **except** for the user-assigned stories of
2026-08-28 (E04-S039/S040/S047 bootstrap, SQLite foundation, health; the
identity/conversation/model-gateway/feedback service plugins are mounted here
by E02-S032, E04-S041～S044, E12-S031, E13-S019). Runtime decisions:
`docs/adr/0003-api-runtime-sqlite-sse.md`. Team A's Next.js apps still consume
this surface only through typed clients generated from `contracts/openapi/`,
and Team-A-side BFF logic still lives inside `apps/web`/`apps/admin` route
handlers — see `docs/adr/0001-team-a-bff-location.md`.
