# @ai-km/api-client

Typed HTTP client generated from `contracts/openapi/*.yaml`.

Nothing is generated yet — `contracts/openapi/core.yaml` only has the shared
`Error`/`Pagination` schemas as a scaffold check. Once Team B freezes real
contracts for E02 (auth), E04 (retrieval/citation) and E12 (model gateway),
add them under `contracts/openapi/`, then run:

```
pnpm --filter @ai-km/api-client generate
```

This regenerates `src/generated/*` from the spec — do not hand-edit
generated files. Re-export what apps need from `src/index.ts`.
