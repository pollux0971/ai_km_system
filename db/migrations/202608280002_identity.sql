-- E02-S032 — identity domain: session-cookie login thin slice.
--
-- Shapes follow ADR 0005 and the frozen contract in
-- contracts/openapi/auth.yaml (E02-S031). Columns are snake_case; every
-- timestamp is an ISO-8601 UTC string, matching every other domain's
-- convention in this schema.
--
-- Schema only: seeding the demo accounts is a runtime concern
-- (services/identity's seedDemoUsers()), gated by AI_KM_SEED_DEMO_USERS —
-- never baked into a migration, which would run unconditionally in every
-- environment including production.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT    PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  -- scrypt output/salt, hex-encoded. Never the plaintext password.
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  department    TEXT    NOT NULL,
  group_name    TEXT    NOT NULL,
  -- JSON array of role name strings. Informational for this story — RBAC
  -- evaluation is a later E02 story; requireSession only carries this
  -- through to request.auth.roles.
  roles         TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(roles)),
  disabled      INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at    TEXT    NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id             TEXT    PRIMARY KEY,
  -- SHA-256 of the opaque 256-bit cookie token (ADR 0005 §2). The token
  -- itself never reaches this table, so a database disclosure alone does not
  -- yield a usable session.
  token_hash     TEXT    NOT NULL UNIQUE,
  user_id        TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- "<userId>" in production; "<userId>:sbx:<uuid>" under
  -- AI_KM_TEST_SANDBOX=true (ADR 0005 §5). Every domain's owner-scoped query
  -- filters on THIS, never on user_id directly.
  owner_key      TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  -- Slides forward on every successful requireSession check; idle > 12h is
  -- treated as expired even before the absolute 7-day expires_at.
  last_seen_at   TEXT    NOT NULL,
  expires_at     TEXT    NOT NULL
) STRICT;

-- requireSession looks up by token hash on every protected request.
CREATE INDEX idx_sessions_token_hash ON sessions (token_hash);
-- Serves the startup/hourly expiry sweep.
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_sessions_last_seen_at ON sessions (last_seen_at);
