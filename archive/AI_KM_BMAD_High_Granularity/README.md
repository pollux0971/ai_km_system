# AI KM Enterprise Platform

Complete BMAD development baseline and high-granularity Story Pack for an enterprise AI Knowledge Management & Work Assistant Platform.

> **Primary documentation language:** Traditional Chinese.  
> For the complete project introduction, team ownership, parallel-development workflow, Monorepo structure, Story execution rules and Definition of Done, see **`readme_zh.md`**.

## Delivery model

The project uses:

- Monorepo
- Two-Team Collaboration
- Contract-First development
- Domain Ownership
- Authorization Before Retrieval
- Deny-Wins authorization
- Thin-Slice MVP across all core capabilities
- Automated evidence before Story completion

## Team ownership

### Team A — Experience & Application

Owns:

- E01 Application Shell & User Workspace
- E03 AI Conversation Experience
- E05 Knowledge Management Experience
- E07 Maintenance Assistant Experience
- E09 AI ERP & Reporting Experience
- E11 Admin Console
- E13 Feedback & Analytics

Team A focuses on Web/Admin UX, application integration, BFF where required, typed API clients, user-facing workflows and E2E validation.

### Team B — Data & Intelligence Platform

Owns:

- E02 Identity, RBAC & Authorization
- E04 RAG & Conversation Intelligence
- E06 Knowledge Ingestion & Indexing
- E08 Maintenance Intelligence Backend
- E10 Enterprise Data Integration
- E12 Model & Prompt Platform
- E14 Audit, Security & Observability

Team B focuses on databases, backend core, authorization, RAG, vector search, ingestion, model gateway, connectors, audit, security and observability.

## Collaboration rule

Team A must not wait for Team B to finish an entire backend feature.

For cross-team work:

```text
Story
→ Contract
→ Schema / Errors / Permissions
→ Contract Freeze
→ Team A + Team B parallel implementation
→ Contract Test
→ Integration
→ E2E / Security / RAG Evaluation
→ Done
```

Mocks may unblock development, but mock-only evidence never proves production integration.

## Repository

See `readme_zh.md` for the complete repository structure and operating rules.

## Story execution

Give a coding agent one atomic Story at a time together with its direct dependencies, contracts, ADRs, relevant code and required test gates.

A Story is not Done without reproducible automated evidence.
