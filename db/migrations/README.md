# db/migrations

Forward-only SQL migrations for the AI KM SQLite database
([ADR 0003 §2](../../docs/adr/0003-api-runtime-sqlite-sse.md)). Created by
**E04-S040**; the runner lives in `apps/api/src/db/migrate.ts`.

## Naming

```
<YYYYMMDDNNNN>_<snake_case_description>.sql
        │           └─ what it does, readable in a directory listing
        └───────────── date + a 4-digit counter for that day
```

e.g. `202608280001_conversation_domain.sql`.

Files are applied in **filename order**, not directory order, so the prefix is
the only thing that decides sequencing. Two stories landing on the same day
take different counters — E04-S040 owns `…0001`, E02-S032 owns `…0002` — which
is why they can be developed in parallel without a merge conflict.

## Adding one

1. Create the file with the next unused prefix.
2. Write plain SQL. **Schema only** — no seed rows, no secrets, no
   environment-specific values. Seeds belong to the story that needs them.
3. Run it: `pnpm --filter @ai-km/api migrate`, or just start the API in
   development (`AI_KM_AUTO_MIGRATE` defaults to true).
4. Add a test that proves the new structure does what you intended — the
   existing ones in `apps/api/src/db/migrate.test.ts` show the pattern
   (cascades, CHECK constraints, indexes).

## Rules the runner enforces

- **Each file runs in its own transaction.** A migration that fails partway
  leaves no schema change and no bookkeeping row.
- **Applied files are immutable.** `schema_migrations` stores a SHA-256 of
  each applied file. If an already-applied file's contents change, the runner
  **refuses to start**, names the file, and applies nothing further.

  This is the whole point of the checksum. Editing an applied migration is one
  of the few ways two environments diverge *silently*: every database claims
  the migration ran, but they no longer have the same schema. To change
  something, add a new migration.
- **Applied files may not be deleted** either — same failure, same reason.
- Line endings are normalised before hashing, so a different git
  `core.autocrlf` setting does not look like tampering.

## Rollback

There are no `down` migrations, deliberately. A down migration is written
before anyone knows how the forward one will actually fail, is almost never
exercised, and gives false confidence in the one situation where confidence is
expensive. Instead:

- **Not yet released** → edit the file, and drop the local database
  (`rm -rf apps/api/data/`) so it re-applies from scratch.
- **Already released** → write a new forward migration that undoes it.
- **Destructive change** (dropping a column or table) → it needs an explicit
  plan and a backup step, per DEVELOPMENT_POLICY §9. Do not stack a
  destructive change into an unrelated migration.

## Auto-migrate vs. explicit

| Environment | `AI_KM_AUTO_MIGRATE` | Why |
|---|---|---|
| development / test | `true` (default) | first run just works |
| production | **`false`** | run `pnpm --filter @ai-km/api migrate` as its own deploy step, so a schema change is a decision rather than a side effect of a restart |

## Current migrations

| File | Story | Contents |
|---|---|---|
| `202608280001_conversation_domain.sql` | E04-S040 | `conversations`, `messages`, `change_events` + indexes |

`schema_migrations` itself is created by the runner, not by a migration.
