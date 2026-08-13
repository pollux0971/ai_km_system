# apps/api

Owner: **Team B** (Data & Intelligence Platform).

Hosts the backend API surface for the Team-B-owned domains (E02 Identity/RBAC,
E04 RAG & Conversation Intelligence, E06 Ingestion, E08 Maintenance
Intelligence, E10 Enterprise Data Integration, E12 Model & Prompt Platform,
E14 Audit/Security/Observability). Not yet scaffolded — Team B decides the
concrete framework/language.

Team A does not implement here. Team A's Next.js apps consume this surface
only through typed clients generated from `contracts/openapi/`, and any
Team-A-side BFF logic lives inside `apps/web`/`apps/admin` route handlers,
never here — see `docs/adr/0001-team-a-bff-location.md`.
