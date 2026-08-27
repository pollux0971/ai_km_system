# db/seeds

Owner: **Team B**.

Frontend (Team A) never reads/writes the database directly — this is a hard
architectural rule (see `AI_KM_BMAD_High_Granularity/policies/DEVELOPMENT_POLICY.md`
#11 and `SOURCE_BASELINE.md` §10). Not yet scaffolded.

**2026-08-28:** dev/E2E seeds (demo users, 3 sample conversations + messages)
are owned by the user-assigned Team A stories E02-S032/E02-S033/E04-S041/
E04-S042 and are only applied when `AI_KM_SEED_DEMO_USERS`/`AI_KM_TEST_SANDBOX`
are enabled — never in production.
