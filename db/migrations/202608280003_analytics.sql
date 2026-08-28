-- E13-S019 — usage-event persistence (contracts/openapi/analytics.yaml).
--
-- One row per client-observed usage event. `name` is intentionally NOT
-- constrained to the contract's current 3-value whitelist here: the
-- contract (not the schema) is this repo's single source of truth for the
-- whitelist, and a future contract-approved 4th value must not require a
-- migration to accept.
CREATE TABLE usage_events (
  id               TEXT NOT NULL PRIMARY KEY,
  owner_key        TEXT NOT NULL,
  -- Separate from owner_key on purpose (AuthContext doc, apps/api/src/
  -- types.ts): under AI_KM_TEST_SANDBOX, owner_key carries a per-login
  -- sandbox suffix but user_id stays the real underlying account — DAU
  -- must count real users, not sandbox instances of the same user.
  user_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  conversation_id  TEXT,
  answer_state     TEXT CHECK (
                     answer_state IS NULL OR answer_state IN (
                       'ANSWERED', 'PARTIAL', 'NO_EVIDENCE',
                       'ERROR', 'PERMISSION_DENIED', 'SOURCE_UNAVAILABLE'
                     )
                   ),
  citation_count   INTEGER CHECK (citation_count IS NULL OR citation_count >= 0),
  latency_ms       INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  occurred_at      TEXT NOT NULL,
  received_at      TEXT NOT NULL
) STRICT;

-- Trailing-window queries (latency) scan by time first.
CREATE INDEX idx_usage_events_occurred_at ON usage_events (occurred_at);

-- Per-event-name aggregation (DAU, questionsAsked) filters by name, then
-- range-scans occurred_at within that name.
CREATE INDEX idx_usage_events_name_occurred_at ON usage_events (name, occurred_at);
