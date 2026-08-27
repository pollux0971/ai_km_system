# db/migrations

Owner: **Team B**.

Frontend (Team A) never reads/writes the database directly — this is a hard
architectural rule (see `AI_KM_BMAD_High_Granularity/policies/DEVELOPMENT_POLICY.md`
#11 and `SOURCE_BASELINE.md` §10). Not yet scaffolded.

**2026-08-28:** user-assigned Team A stories add the first migrations here
(E04-S040 `…0001_conversation_domain.sql`, E02-S032 `…0002_identity.sql`,
E13-S019 `…0003_analytics.sql`; runner in `apps/api/src/db`). Naming and
rollback rules are defined by E04-S040 — see `docs/adr/0003-api-runtime-sqlite-sse.md`.
