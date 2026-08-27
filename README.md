# ai-km

Enterprise AI Knowledge Management & Work Assistant Platform — an on-prem
platform integrating enterprise documents, knowledge base, ERP, MES, HR,
CRM, SCM, PLM, IoT and maintenance records via RAG, RBAC, source citation,
model governance and full audit trails.

The authoritative product/architecture baseline lives in
[`AI_KM_BMAD_High_Granularity/`](./AI_KM_BMAD_High_Granularity) — start with
[`readme_zh.md`](./AI_KM_BMAD_High_Granularity/readme_zh.md) (primary,
Traditional Chinese) or [`README.md`](./AI_KM_BMAD_High_Granularity/README.md)
(English summary). This root README only covers the engineering monorepo
built on top of that baseline.

## Team split

- **Team A — Experience & Application** (this scaffold's primary author):
  owns E01 Application Shell, E03 AI Conversation Experience, E05 Knowledge
  Management Experience, E07 Maintenance Assistant Experience, E09 AI ERP &
  Reporting Experience, E11 Admin Console, E13 Feedback & Analytics. Focus:
  `apps/web`, `apps/admin`, shared `packages/*`, application-level E2E.
- **Team B — Data & Intelligence Platform**: owns E02 Identity/RBAC/Auth,
  E04 RAG & Conversation Intelligence, E06 Knowledge Ingestion & Indexing,
  E08 Maintenance Intelligence Backend, E10 Enterprise Data Integration,
  E12 Model & Prompt Platform, E14 Audit/Security/Observability. Focus:
  `apps/api`, `apps/worker-*`, `services/*`, `db/*`.

The monorepo is **not** split into `team-a/`/`team-b/` folders — Domain
Ownership beats Team Folder Ownership. Every folder below states its owner
in its own `README.md`.

**2026-08-28 assignment:** the user assigned Team A a batch of 40 user-added
stories (E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021) that implement the first real backend slice (`apps/api`,
`services/identity|conversation|model-gateway|feedback`, `db/migrations`),
voice input (server-side whisper), conversation persistence, cross-window
sync, Material 3 UI, and a tech-debt clean-up. Domain ownership of E02/E04/E12
stays with Team B; contract changes still need domain-owner review. Read
`docs/architecture/voice-persistence-sync-m3.md` and
`docs/architecture/tech-debt-audit-2026-08-28.md` first.

## Layout

```
apps/            web (Team A), admin (Team A), api / worker-* (Team B)
packages/        shared: ui, design-tokens, auth-client, api-client, types,
                 config, logger, validation, permissions, testing
services/        Team B domain services (identity, retrieval, ingestion, ...)
db/              Team B — migrations/seeds/schemas/views
contracts/       openapi, events, permissions, data-contracts — the single
                 source of truth for every cross-team seam (Contract-First)
infra/           docker, kubernetes, observability, scripts
docs/            adr, architecture, api, product, runbooks, security
tests/           e2e, integration, performance, security, rag-evaluation
```

## Getting started

```bash
nvm use            # Node 22 (see .nvmrc)
pnpm install
pnpm dev            # apps/web on :3000, apps/admin on :3001
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## How Team A works against Team B's domains

Per the Contract-First / parallelization rule in `readme_zh.md`: Team A does
not wait for Team B. For the first vertical slice (login → chat with
citation), Team A builds against **typed clients generated from
`contracts/openapi`** plus contract-compatible mocks for the E02 (auth), E04
(retrieval/citation) and E12 (model gateway) seams — see
[`packages/api-client/README.md`](./packages/api-client/README.md). Team A
may build BFF logic inside `apps/web`/`apps/admin` Route Handlers (see
[`docs/adr/0001-team-a-bff-location.md`](./docs/adr/0001-team-a-bff-location.md)),
but must never bypass the real Domain Service, Authorization, or the frozen
Contract once it exists.

## Non-negotiable rules

Every story (human- or agent-implemented) must follow:

- [`policies/DEVELOPMENT_POLICY.md`](./AI_KM_BMAD_High_Granularity/policies/DEVELOPMENT_POLICY.md)
- [`policies/ATOMIC_STORY_BOUNDARIES.md`](./AI_KM_BMAD_High_Granularity/policies/ATOMIC_STORY_BOUNDARIES.md)
- [`policies/TESTING_POLICY.md`](./AI_KM_BMAD_High_Granularity/policies/TESTING_POLICY.md)

Highlights: Authorization Before Retrieval, Deny-Wins, unauthorized data
must never reach retrieval/LLM context/citation/export/logs, frontend never
touches DB/vector store directly, no story is Done without automated
evidence.
