-- E04-S040 — conversation domain initial schema.
--
-- Shapes follow the frozen contract in contracts/openapi/conversations.yaml
-- (E04-S038). Columns are snake_case; every timestamp is an ISO-8601 UTC
-- string, matching the contract's `format: date-time`, so ordering is plain
-- lexicographic and no timezone conversion happens in SQL.
--
-- Schema only: no seed rows, no secrets. Seeds belong to E04-S041/S042.

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id                   TEXT    PRIMARY KEY,
  -- Every domain row is owned. NOT NULL is the data-layer half of Deny-Wins:
  -- an unowned row could not be filtered by any owner-scoped query and would
  -- therefore be invisible to its owner and reachable by a bug in anyone
  -- else's.
  owner_key            TEXT    NOT NULL,
  title                TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  mode                 TEXT    NOT NULL CHECK (mode IN ('normal', 'advanced')),
  -- JSON array of KnowledgeScope. json_valid stops a malformed write at the
  -- boundary rather than at read time in some unrelated request.
  knowledge_scopes     TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(knowledge_scopes)),
  model                TEXT    NOT NULL CHECK (model IN ('standard', 'advanced-local', 'cloud')),
  -- 0/1 rather than a boolean type: SQLite has none, and the CHECK keeps any
  -- other integer out.
  archived             INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  last_message_at      TEXT    NOT NULL,
  last_message_preview TEXT    NOT NULL,
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL
) STRICT;

-- Serves the list endpoint exactly: filter by owner, switch on archived, sort
-- by last_message_at descending.
CREATE INDEX idx_conversations_owner_archived_last_message
  ON conversations (owner_key, archived, last_message_at DESC);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
  id               TEXT NOT NULL PRIMARY KEY,
  -- ON DELETE CASCADE makes "delete a conversation deletes its messages" a
  -- property of the schema rather than something every future call site has
  -- to remember. Requires foreign_keys=ON, which openDatabase sets and a test
  -- asserts.
  conversation_id  TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- Denormalised from the parent on purpose: it lets every message query be
  -- owner-scoped on its own, without a join whose absence would silently
  -- widen the scope.
  owner_key        TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  attachment_names TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attachment_names)),
  state            TEXT CHECK (
                     state IS NULL OR state IN (
                       'ANSWERED', 'PARTIAL', 'NO_EVIDENCE',
                       'ERROR', 'PERMISSION_DENIED', 'SOURCE_UNAVAILABLE'
                     )
                   ),
  revisions        TEXT CHECK (revisions IS NULL OR json_valid(revisions)),
  feedback         TEXT CHECK (feedback IS NULL OR feedback IN ('OK', 'NG')),
  feedback_reason  TEXT CHECK (
                     feedback_reason IS NULL OR feedback_reason IN (
                       'INCORRECT', 'INCOMPLETE', 'OFF_TOPIC', 'OTHER'
                     )
                   ),
  feedback_comment TEXT CHECK (feedback_comment IS NULL OR length(feedback_comment) <= 500),
  citation_feedback TEXT CHECK (citation_feedback IS NULL OR json_valid(citation_feedback)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
) STRICT;

-- A thread is always read whole, oldest first.
CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- change_events — the per-owner log behind the SSE stream (ADR 0003 §7)
-- ---------------------------------------------------------------------------
CREATE TABLE change_events (
  -- Global insertion order, useful only for debugging.
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key        TEXT NOT NULL,
  -- The number the client actually sees as the SSE `id:`. Monotonic PER
  -- OWNER, not globally: a global counter would leak how much traffic other
  -- users generate, and would make Last-Event-ID replay scan rows that can
  -- never belong to the caller.
  seq              INTEGER NOT NULL,
  type             TEXT NOT NULL CHECK (
                     type IN (
                       'conversation.created', 'conversation.updated',
                       'conversation.deleted', 'message.created', 'message.updated'
                     )
                   ),
  -- Deliberately NOT a foreign key: a conversation.deleted event must outlive
  -- the row it refers to, or a reconnecting client would never learn about
  -- the deletion.
  conversation_id  TEXT NOT NULL,
  message_id       TEXT,
  -- Echo of the caller's X-Client-Id. Untrusted UX hint only — never used for
  -- ownership, authorization or audit (see contracts/events/
  -- conversation-change-events.md §6).
  origin_client_id TEXT,
  occurred_at      TEXT NOT NULL
) STRICT;

-- Enforces the per-owner monotonic invariant at the storage layer: two
-- concurrent writers cannot both claim the same seq, whatever the repository
-- does.
CREATE UNIQUE INDEX uq_change_events_owner_seq
  ON change_events (owner_key, seq);
