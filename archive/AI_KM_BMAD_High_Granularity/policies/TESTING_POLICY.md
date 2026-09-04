# Testing & Evidence Policy

## Layers
- L0 static: format/lint/type/schema.
- L1 unit: pure rules, validators, reducers, guards.
- L2 seam/contract: client↔API, service↔service, adapter↔provider.
- L3 integration: DB/object/vector/queue boundaries.
- L4 E2E: Login→authorized task→result→citation/audit.
- L5 security/adversarial: revoked permission, cross-scope access, SQL injection, prompt/data leakage.
- L6 RAG evaluation: retrieval recall, citation correctness, abstention, forbidden-source leak rate = 0.

## Completion evidence
Every story records exact command, exit code, relevant test names, changed contracts, migrations, and unresolved assumptions.
A green mock-only path is not enough for a cross-team integration story.
