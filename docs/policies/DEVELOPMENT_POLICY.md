# Development Policy — AI KM

## Non-negotiable
1. Contract-first for every cross-domain/cross-team seam.
2. Authorization-before-retrieval and Deny-Wins.
3. Unauthorized data must never enter retrieval context, LLM prompt, citation, export, logs, or analytics.
4. Fail closed. No silent fallback from protected enterprise data to broader scope.
5. Every sensitive mutation and AI/SQL execution path is auditable.
6. No story is Done without automated evidence.
7. No `passWithNoTests`, force-exit workaround, blanket test skip, or permission bypass.
8. Mocks unblock parallel work but never count as production integration evidence.
9. DB migration is forward/reversible where practical; destructive changes require explicit migration plan.
10. Secrets never live in source, fixtures, logs, prompts, or audit payloads.
11. Frontend never reads DB/vector store directly.
12. Domain ownership beats team-folder ownership.

## Branch / PR
- One atomic story per branch/PR when practical.
- PR title includes Story ID.
- PR description: scope, contract diff, migration, security impact, tests, screenshots/evidence, rollback.
- Cross-domain contract changes require both owners.
- Story scope changes require backlog update before code.

## Required gates
typecheck → lint → unit → contract → integration → security-negative → E2E (critical flow) → evidence review.

## Story sizing
A story is too large if it contains >1 independent user-visible capability, >1 unrelated domain mutation, multiple unrelated API endpoints, or cannot be proven by a compact acceptance suite.
