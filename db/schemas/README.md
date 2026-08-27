# db/schemas

Reference documentation for the live database schema. The **authoritative**
definition is the migration files in [`../migrations`](../migrations) — this
directory never defines schema, it only explains it.

Engine: **SQLite** via `better-sqlite3`, single file at `AI_KM_DB_PATH`
(default `apps/api/data/ai-km.sqlite`, gitignored), `journal_mode=WAL`,
`foreign_keys=ON`, `busy_timeout=5000`
([ADR 0003 §2](../../docs/adr/0003-api-runtime-sqlite-sse.md)). PostgreSQL is
an explicit non-goal.

## Conventions

- Column names are `snake_case`; the API converts to `camelCase` at the
  contract boundary.
- Timestamps are **ISO-8601 UTC strings**, matching the contract's
  `format: date-time`. Ordering is therefore plain lexicographic and no
  timezone conversion happens in SQL.
- Booleans are `INTEGER` `0`/`1` with a `CHECK` — SQLite has no boolean type,
  and the CHECK keeps every other integer out.
- JSON-valued columns carry a `json_valid(...)` `CHECK`, so a malformed write
  fails at the boundary instead of surfacing as a parse error inside an
  unrelated later request.
- Enum-ish columns carry an explicit `CHECK ... IN (...)` listing exactly the
  values the frozen contract declares.
- Tables are `STRICT`, so SQLite's type affinity cannot quietly store a string
  in an integer column.

## Owner scoping

**Every domain table has a `NOT NULL owner_key`.** This is the data-layer half
of Deny-Wins: a row with no owner could not be matched by any owner-scoped
query, so it would be invisible to its owner while remaining reachable by a
bug in somebody else's.

`messages.owner_key` is denormalised from its parent conversation on purpose —
it lets every message query be owner-scoped on its own, rather than depending
on a join whose accidental omission would silently widen the scope.

Repositories must go through `prepareOwnerScoped()` in
`services/conversation/src/repository/owner-scope.ts`, which refuses to
prepare a statement that has no `owner_key` predicate.

## Tables (as of E04-S040)

### `conversations`
One row per conversation. Indexed by
`(owner_key, archived, last_message_at DESC)` — exactly the list endpoint's
access pattern: scope to the owner, switch between the active and archived
views, sort newest first.

### `messages`
One row per message, `conversation_id` referencing `conversations(id)`
**`ON DELETE CASCADE`**, so "deleting a conversation deletes its messages" is
a property of the schema rather than something every future call site has to
remember. Indexed by `(conversation_id, created_at)` — a thread is always read
whole, oldest first.

### `change_events`
The per-owner append-only log behind the SSE stream (ADR 0003 §7).

- `seq` is monotonic **per owner**, not globally. A global counter would leak
  how much traffic other users generate, and would make `Last-Event-ID`
  replay scan rows that can never belong to the caller.
- `UNIQUE (owner_key, seq)` enforces that invariant in storage, so a bug in
  the repository becomes a loud constraint error instead of two clients
  silently sharing an event id.
- `conversation_id` is deliberately **not** a foreign key: a
  `conversation.deleted` event must outlive the row it refers to, or a
  reconnecting client would never learn about the deletion.
- `origin_client_id` is an untrusted echo of the caller's `X-Client-Id`. It is
  a UX hint for suppressing a window's own echo and carries no authorization
  meaning whatsoever.

### `schema_migrations`
Bookkeeping, created by the runner rather than by a migration:
`name`, `applied_at`, `checksum`.

## Not here yet

| Tables | Owner |
|---|---|
| `users`, `sessions` | E02-S032 (`202608280002_identity.sql`) |
| analytics / usage events | E13-S019 |
