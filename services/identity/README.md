# services/identity

Owner: **Team B** — E02 Identity, RBAC & Authorization.

Owns authentication, RBAC, resource ACL, Deny-Wins authorization decisions.
Frontend (Team A) never calls this directly except through the typed API
client defined by `contracts/openapi`. Not yet scaffolded.
