# contracts/openapi

Single source of truth for cross-team API contracts (Contract-First policy).

- `core.yaml` is a scaffold-only starter: shared `Error`/`Pagination` schemas
  and no real paths. It exists to prove the codegen pipeline
  (`@ai-km/api-client generate`) works end-to-end.
- Real contracts must be negotiated with the owning Team B domain before
  being added here. Do not invent endpoints/schemas — per
  `AI_KM_BMAD_High_Granularity/policies/ATOMIC_STORY_BOUNDARIES.md`, unknown
  contracts must be reported as BLOCKED, not guessed.
- Per `AI_KM_BMAD_High_Granularity/policies/DEVELOPMENT_POLICY.md`,
  cross-domain contract changes require both the Team A and Team B owner to
  review the PR.
- Team A's first three needed contracts (see the suggested vertical slice in
  `readme_zh.md`): E02 minimum auth (login/session/logout), E04 authorized
  retrieval + citation, E12 local model gateway chat/completion (streaming).
- **2026-08-28:** the user approved four contract stories to be authored by
  Team A (domain owner review still required before freeze): `auth.yaml`
  (E02-S031), `conversations.yaml` + `contracts/events/conversation-change-events.md`
  (E04-S038), `transcriptions.yaml` (E12-S029), `analytics.yaml` (E13-S018).
  Every other endpoint is still BLOCKED-until-negotiated.

## Frozen specs

| Spec | Story | Domain owner | Consumers |
|---|---|---|---|
| `core.yaml` | scaffold | shared | shared `Error` / `Pagination` only; no paths |
| `auth.yaml` | E02-S031 | E02 (Team B); authored by Team A | E02-S032, E03-S034/S035, E11-S026, E13-S018 |
| `conversations.yaml` | E04-S038 | E04 (Team B); authored by Team A | E03-S034/S036/S037/S039, E04-S041~S044, E13-S018 |

`conversations.yaml` covers conversation + message persistence and the
`GET /v1/conversations/events` change-event stream. Its event semantics —
which endpoint emits which event, replay, `resync`, heartbeats — are
normative in `contracts/events/conversation-change-events.md`.

Compatibility with the shapes apps/web already uses is enforced by a
typecheck-only gate in `contracts/openapi/__checks__/` (see its README for
the exact commands). That gate is not in CI yet; E03-S034 owns wiring the
codegen + drift gate into the build.


`auth.yaml` is the frozen slice of E02-S009 (local authentication endpoint):
`POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/session`. It is
also the **canonical definition of the `sessionCookie` security scheme** —
other specs describe the same cookie, and new specs should `$ref` this one
rather than restate it.
