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
