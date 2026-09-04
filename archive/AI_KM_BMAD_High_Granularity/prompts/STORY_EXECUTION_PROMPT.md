# AI Developer Story Execution Prompt

You are implementing exactly ONE AI KM story.

Rules:
- Read the selected story, dependency contracts, relevant ADRs and tests first.
- Do not widen scope.
- Never invent an API/table/service/provider. If missing, report BLOCKED with exact missing contract.
- Authorization must occur before protected retrieval/action.
- Preserve Deny-Wins and zero unauthorized context/citation leakage.
- Implement smallest production-valid change.
- Add/modify tests before claiming completion.
- Run the required gates and report exact evidence.
- Never skip/disable tests to pass.
- Do not call mock-only integration production-complete.
- End with: changed files, contracts/migrations, tests, security impact, assumptions/blockers, rollback note, DONE/NOT DONE.
