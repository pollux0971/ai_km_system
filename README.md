# ai-km

Enterprise AI Knowledge Management & Work Assistant Platform — an on-prem
platform integrating enterprise documents, knowledge base, ERP, MES, HR,
CRM, SCM, PLM, IoT and maintenance records via RAG, RBAC, source citation,
model governance and full audit trails.

**2026-09-04 (ADR 0008):** the original BMAD spec library is superseded by a staged-Gherkin
paradigm and has been archived (rename, history preserved) to
[`archive/AI_KM_BMAD_High_Granularity/`](./archive/AI_KM_BMAD_High_Granularity) — frozen at
tag `baseline-bmad`, background reading only, not a source of truth for any current work.
Start instead with [`docs/00-design.md`](./docs/00-design.md) (frozen product-design snapshot)
and [`docs/README.md`](./docs/README.md) (reading map for everything else: roadmap, ADRs,
glossary, integration points). The three non-negotiable policies below are copied verbatim
into [`docs/policies/`](./docs/policies/), which is the canonical place to read them now.
This root README only covers the engineering monorepo built on top of that baseline.

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

**2026-09-02 assignment:** the user authorized creating
`services/rag-skeleton/` — a RAG walking skeleton in five layers (chunking,
embedding provider, vector store, authorization scope, generation provider),
corresponding to E04 RAG & Conversation Intelligence and E06 Knowledge
Ingestion & Indexing — plus two new contracts,
`contracts/openapi/embedding.yaml` and `contracts/openapi/generation.yaml`.
These are all new files; no existing Team B code or story was modified.
Domain ownership stays with Team B; folding the skeleton back into the
existing `services/retrieval`, `ingestion`, `knowledge` and `generation`
stubs later needs domain-owner review.

(`services/rag-skeleton/` was retired by E04-S064 on 2026-09-02 and the directory no longer exists. This paragraph is retained as a record of what was authorized; it no longer grants permission to modify any path.)

**2026-09-02 addendum (Model Gateway wiring only):** the user additionally
authorized a narrow slice of Team B territory — embedding/generation provider
abstractions plus `POST /v1/embeddings` and `POST /v1/generate` thin-wrapper
routes in `services/model-gateway/`, and the conditional registration,
contract loading and package.json changes in `apps/api/` that those need.
The grant covers steps **g1 through g5**; g5 — relocating the deterministic and
canned providers out of `services/rag-skeleton` into the gateway — is tracked
as E12-S032 / E12-S033. (Corrected 2026-09-02: first written as "g1–g4",
dropping g5 from the user's own wording. Caught by E12-S032's independent
reviewer, who noticed CLAUDE.md rule 6's Team A exception list names
E12-S029–S031 but not S032. The correction aligns the record with what was
actually granted; it does not widen it.)
Baseline §5 rule 28 requires model calls to go through the Model Gateway;
`apps/api` is a single process (ADR 0003 §1), so the in-process function is the
primary path and the HTTP routes delegate to it rather than reimplementing it.
**This covers that wiring only — it is not blanket access to
`services/model-gateway/` or `apps/api/`**, and no other Team B story is in
scope. Domain ownership stays with Team B. Conditional registration follows the
existing `conversationPlugin` / `feedbackPlugin` pattern.

**2026-09-02 assignment (Wave 1 — dissolving the skeleton into real services):**
the user approved a Wave 1 work breakdown that converts `services/rag-skeleton/`
into the real `services/retrieval`, `services/generation` and `services/ingestion`
(index side only), and authorized Team A to implement it. The grant covers
E04-S009/S016 and E04-S058～S067, E06-S008/S022/S026/S041/S042/S043, and
E12-S032～S033, each within that story's own allowed-modify list. Domain
ownership of E04/E06/E12 stays with Team B.

(Recorded 2026-09-02, after the fact. The Wave 1 plan the user approved names
these three services explicitly, but neither this file nor CLAUDE.md rule 6
listed them, so `services/retrieval`, `services/generation` and
`services/ingestion` were being modified under a grant that existed in the
conversation and not in the record. This entry closes the gap between the record
and what was actually granted; it does not widen the grant. Same class of error
as the "g1–g4" slip corrected above — and found the same way, by an independent
reviewer reading the exception list rather than the conversation.)

🚩 **Not yet wired into `apps/api`.** None of the three plugins is registered in
the composition root, and E06-S043 (re-ingest scope guard) is a hard precondition
before any of them may be. See `archive/stories/PROGRESS.md`.

(`services/rag-skeleton/` was retired by E04-S064 on 2026-09-02 and the directory no longer exists. This paragraph is retained as a record of what was authorized; it no longer grants permission to modify any path.)

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

- [`policies/DEVELOPMENT_POLICY.md`](./docs/policies/DEVELOPMENT_POLICY.md)
- [`policies/ATOMIC_STORY_BOUNDARIES.md`](./docs/policies/ATOMIC_STORY_BOUNDARIES.md)
- [`policies/TESTING_POLICY.md`](./docs/policies/TESTING_POLICY.md)

Highlights: Authorization Before Retrieval, Deny-Wins, unauthorized data
must never reach retrieval/LLM context/citation/export/logs, frontend never
touches DB/vector store directly, no story is Done without automated
evidence.
