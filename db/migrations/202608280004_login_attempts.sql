-- E02-S034 — login rate limiting / lockout ledger.
--
-- Not a foreign key to users: an attempt against a username that does not
-- exist must still be recordable (per-IP throttling has to count attempts
-- against brand-new/nonexistent accounts too — AC3), and account
-- enumeration must never leak through a constraint violation.
--
-- Rows are transient by design (services/identity sweeps anything older
-- than 24h, startup + hourly) — this is a short-lived throttling ledger,
-- not a permanent audit log.

CREATE TABLE login_attempts (
  id           TEXT    PRIMARY KEY,
  -- Raw submitted username (validated 1-64 chars by the contract's
  -- LoginRequest schema, never further sanitised) — this is exactly what a
  -- rate limiter needs to key on, whether or not the account is real.
  username     TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  succeeded    INTEGER NOT NULL CHECK (succeeded IN (0, 1)),
  attempted_at TEXT    NOT NULL
) STRICT;

-- Per-username throttle query: failures for one username, newest first.
CREATE INDEX idx_login_attempts_username_attempted_at
  ON login_attempts (username, attempted_at);
-- Per-IP throttle query: failures for one IP, newest first.
CREATE INDEX idx_login_attempts_ip_attempted_at
  ON login_attempts (ip, attempted_at);
-- Serves the startup/hourly 24h sweep.
CREATE INDEX idx_login_attempts_attempted_at
  ON login_attempts (attempted_at);
