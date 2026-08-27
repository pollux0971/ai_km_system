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
