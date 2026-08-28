# services/identity

Owner: **Team B** — E02 Identity, RBAC & Authorization.

Owns authentication, RBAC, resource ACL, Deny-Wins authorization decisions.
Frontend (Team A) never calls this directly except through the typed API
client defined by `contracts/openapi`. Not yet scaffolded.

**2026-08-28:** the user assigned Team A the thin slice E02-S031～S033
(`@ai-km/service-identity`: session-cookie login/logout/session, demo/admin
account seed, `requireSession`/`requireAnyRole`, E2E test sandbox — see
`docs/adr/0005-session-cookie-auth-and-test-sandbox.md`). Full E02 (OIDC/LDAP,
RBAC evaluator, permission matrix) remains Team B.

## E02-S032 — session-cookie login (this story)

Ships `identityPlugin`, registered once from `apps/api/src/server.ts`:

- `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/session` — the
  frozen slice of `contracts/openapi/auth.yaml` (E02-S031).
- The real `requireSession` (`node:crypto` scrypt password check, SHA-256
  session-token hashing, 7-day absolute / 12-hour idle expiry). It COMPOSES
  over whatever `apps/api/src/auth-decorator.ts` (E04-S039) already decorated
  `requireSession` with — see `src/require-session.ts`'s docstring for why a
  request with no `ai_km_session` cookie falls back to that seam instead of
  being denied outright.
- `db/migrations/202608280002_identity.sql` — `users` / `sessions`.
- `seedDemoUsers()` — the 3 `packages/auth-client/src/mock.ts` `ACCOUNTS`
  demo users plus one `disabled` account, gated by `AI_KM_SEED_DEMO_USERS`
  (default true outside production).
- `registerSandboxSeeder()` — the registry `AI_KM_TEST_SANDBOX` logins run
  against; E04-S041/S042 register the real seeders.

Self-contained on purpose (own config/env parsing, own Fastify type
augmentation, own contract-schema literal): this package must never depend on
`apps/api`, since `apps/api` is what depends on it. See `src/config.ts` and
`src/plugin.ts` for the reasoning.

Run `pnpm --filter @ai-km/service-identity test` for this story's own suite
(config/crypto/repository/require-session/plugin, including a `auth.yaml`
contract-schema validation pass) independent of the rest of the monorepo.
