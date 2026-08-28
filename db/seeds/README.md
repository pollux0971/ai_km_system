# db/seeds

Owner: **Team B**.

Frontend (Team A) never reads/writes the database directly — this is a hard
architectural rule (see `AI_KM_BMAD_High_Granularity/policies/DEVELOPMENT_POLICY.md`
#11 and `SOURCE_BASELINE.md` §10). Not yet scaffolded.

**2026-08-28:** dev/E2E seeds (demo users, 3 sample conversations + messages)
are owned by the user-assigned Team A stories E02-S032/E02-S033/E04-S041/
E04-S042 and are only applied when `AI_KM_SEED_DEMO_USERS`/`AI_KM_TEST_SANDBOX`
are enabled — never in production.

**E04-S041** implements the 3-sample-conversation half of this:
`seedSampleConversations(db, ownerKey)` in
`services/conversation/src/seed/sample-conversations.ts` — field-for-field
the same content as `apps/web/src/lib/conversations.ts`'s
`SAMPLE_CONVERSATIONS` (title/lastMessageAt/preview/mode/knowledgeScopes/
model), with ids derived from `ownerKey` via UUID v5 (`seed/uuid-v5.ts`) so
repeated calls for the same owner are idempotent (`INSERT OR IGNORE`).
E02-S032 (not yet merged) is expected to own the real cross-domain
`sandboxSeeders` registry and call into this; until then this package
exports its own placeholder, `conversationSandboxSeeders`, from
`@ai-km/service-conversation` for E02-S032 to fold in without either story
inventing the other's shape. Messages seeding (E04-S042) is not yet
implemented — a seeded conversation currently has no messages.
