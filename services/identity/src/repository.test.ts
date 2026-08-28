import type { Database } from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./testing/db.js";
import {
  countRecentFailuresByIp,
  countRecentFailuresByUsername,
  countUsers,
  deleteExpiredSessions,
  deleteOldLoginAttempts,
  deleteSessionById,
  deleteSessionByTokenHash,
  findSessionWithUserByTokenHash,
  findUserByUsername,
  identityTablesExist,
  insertSession,
  loginAttemptsTableExists,
  recordLoginAttempt,
  seedDemoUsers,
  touchSession,
} from "./repository.js";

let db: Database;

beforeEach(() => {
  db = createTestDatabase();
});

afterEach(() => {
  db.close();
});

const NOW = "2026-08-28T05:00:00.000Z";

describe("identityTablesExist (AI_KM_AUTO_MIGRATE=false startup guard)", () => {
  it("is true once the migration has been applied", () => {
    expect(identityTablesExist(db)).toBe(true);
  });

  it("is false against a database with no schema at all", () => {
    const bareDb = new BetterSqlite3(":memory:");
    expect(identityTablesExist(bareDb)).toBe(false);
    bareDb.close();
  });
});

describe("migration 202608280002_identity.sql", () => {
  it("creates users and sessions with a working foreign key", () => {
    expect(countUsers(db)).toBe(0);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, password_salt, name, email, department, group_name, roles, disabled, created_at)
       VALUES ('u1','a','h','s','N','e','d','g','[]',0,?)`,
    ).run(NOW);
    expect(() =>
      db
        .prepare(
          "INSERT INTO sessions (id, token_hash, user_id, owner_key, created_at, last_seen_at, expires_at) VALUES ('s1','th','no-such-user','u1',?,?,?)",
        )
        .run(NOW, NOW, NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  it("can be applied twice into fresh in-memory databases without error (re-appliable SQL)", () => {
    expect(() => createTestDatabase().close()).not.toThrow();
  });
});

describe("seedDemoUsers (AC8: idempotent)", () => {
  it("does nothing when seedDemoUsers is false", async () => {
    await seedDemoUsers(db, { seedDemoUsers: false }, NOW);
    expect(countUsers(db)).toBe(0);
  });

  it("seeds exactly the 10 demo accounts (3 mock ACCOUNTS + disabled + 6 admin roles, E02-S033)", async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    expect(countUsers(db)).toBe(10);
    const demoUser = findUserByUsername(db, "demo-user");
    expect(demoUser).toMatchObject({
      id: "mock-user-1",
      name: "示範使用者",
      email: "demo-user@example.com",
      department: "資訊部",
      group_name: "一般使用者群組",
      disabled: 0,
    });
    expect(JSON.parse(demoUser!.roles)).toEqual(["general_user"]);
  });

  it("seeds the disabled account with disabled=1", async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    const disabled = findUserByUsername(db, "disabled");
    expect(disabled?.disabled).toBe(1);
  });

  it("never stores the plaintext seed password", async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    const demoUser = findUserByUsername(db, "demo-user");
    expect(demoUser?.password_hash).not.toContain("demo-pass-123");
  });

  it("does not re-create users on a second call once users exist (idempotent restart)", async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    expect(countUsers(db)).toBe(10);
  });

  describe("E02-S033 — 6 admin accounts, one Role each", () => {
    const ADMIN_ACCOUNTS: Array<{ username: string; role: string }> = [
      { username: "demo-super", role: "super_administrator" },
      { username: "demo-it", role: "it_administrator" },
      { username: "demo-ai", role: "ai_administrator" },
      { username: "demo-auditor", role: "auditor" },
      { username: "demo-km", role: "knowledge_manager" },
      { username: "demo-manager", role: "department_manager" },
    ];

    it.each(ADMIN_ACCOUNTS)("seeds $username with exactly [$role], not disabled", async ({ username, role }) => {
      await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
      const account = findUserByUsername(db, username);
      expect(account).toBeDefined();
      expect(account?.disabled).toBe(0);
      expect(JSON.parse(account!.roles)).toEqual([role]);
    });

    it("gives every admin account a distinct id (no collision with the E02-S032 accounts)", async () => {
      await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
      const ids = new Set(
        ["demo-user", "demo-maintenance", "demo-sales", "disabled", ...ADMIN_ACCOUNTS.map((a) => a.username)].map(
          (username) => findUserByUsername(db, username)!.id,
        ),
      );
      expect(ids.size).toBe(10);
    });
  });
});

describe("sessions repository", () => {
  beforeEach(async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
  });

  it("round-trips a session through insert and lookup by token hash", () => {
    insertSession(db, {
      id: "sess-1",
      tokenHash: "th-1",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z",
    });

    const found = findSessionWithUserByTokenHash(db, "th-1");
    expect(found).toMatchObject({
      session_id: "sess-1",
      user_id: "mock-user-1",
      owner_key: "mock-user-1",
      disabled: 0,
    });
  });

  it("returns undefined for an unknown token hash", () => {
    expect(findSessionWithUserByTokenHash(db, "nope")).toBeUndefined();
  });

  it("touchSession updates last_seen_at", () => {
    insertSession(db, {
      id: "sess-1",
      tokenHash: "th-1",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z",
    });
    touchSession(db, "sess-1", "2026-08-28T06:00:00.000Z");
    expect(findSessionWithUserByTokenHash(db, "th-1")?.last_seen_at).toBe("2026-08-28T06:00:00.000Z");
  });

  it("deleteSessionById removes the row", () => {
    insertSession(db, {
      id: "sess-1",
      tokenHash: "th-1",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z",
    });
    deleteSessionById(db, "sess-1");
    expect(findSessionWithUserByTokenHash(db, "th-1")).toBeUndefined();
  });

  it("deleteSessionByTokenHash removes the row and is a no-op for an unknown hash", () => {
    insertSession(db, {
      id: "sess-1",
      tokenHash: "th-1",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z",
    });
    expect(() => deleteSessionByTokenHash(db, "does-not-exist")).not.toThrow();
    deleteSessionByTokenHash(db, "th-1");
    expect(findSessionWithUserByTokenHash(db, "th-1")).toBeUndefined();
  });

  it("deleteExpiredSessions removes rows past absolute expiry or the idle cutoff, keeps live ones", () => {
    insertSession(db, {
      id: "sess-expired",
      tokenHash: "th-expired",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-08-01T00:00:00.000Z", // in the past relative to NOW
    });
    insertSession(db, {
      id: "sess-idle",
      tokenHash: "th-idle",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: "2026-08-01T00:00:00.000Z", // stale last_seen_at
      expiresAt: "2026-09-04T05:00:00.000Z",
    });
    insertSession(db, {
      id: "sess-live",
      tokenHash: "th-live",
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: "2026-09-04T05:00:00.000Z",
    });

    const removed = deleteExpiredSessions(db, NOW, "2026-08-27T17:00:00.000Z");

    expect(removed).toBe(2);
    expect(findSessionWithUserByTokenHash(db, "th-expired")).toBeUndefined();
    expect(findSessionWithUserByTokenHash(db, "th-idle")).toBeUndefined();
    expect(findSessionWithUserByTokenHash(db, "th-live")).toBeDefined();
  });
});

describe("login_attempts (E02-S034)", () => {
  const FIFTEEN_MIN_AGO = "2026-08-28T04:45:00.000Z"; // NOW = 2026-08-28T05:00:00.000Z
  let seq = 0;
  function attempt(overrides: Partial<Parameters<typeof recordLoginAttempt>[1]> = {}) {
    seq += 1;
    recordLoginAttempt(db, {
      id: `attempt-${seq}`,
      username: "demo-user",
      ip: "203.0.113.1",
      succeeded: false,
      attemptedAt: NOW,
      ...overrides,
    });
  }

  it("loginAttemptsTableExists is true once the migration has been applied", () => {
    expect(loginAttemptsTableExists(db)).toBe(true);
  });

  it("loginAttemptsTableExists is false against a database with no schema at all", () => {
    const bareDb = new BetterSqlite3(":memory:");
    expect(loginAttemptsTableExists(bareDb)).toBe(false);
    bareDb.close();
  });

  describe("countRecentFailuresByUsername", () => {
    it("counts failures within the window for that username", () => {
      attempt({ username: "u1" });
      attempt({ username: "u1" });
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(2);
    });

    it("never counts a success itself as a failure", () => {
      attempt({ username: "u1", succeeded: true });
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(0);
    });

    it("does not count failures outside the window", () => {
      attempt({ username: "u1", attemptedAt: "2026-08-28T04:00:00.000Z" }); // 1h before NOW, outside a 15-min window
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(0);
    });

    it("is scoped per username — another username's failures do not count", () => {
      attempt({ username: "other-user" });
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(0);
    });

    it("AC4: a success resets the count immediately, even for failures still inside the window", () => {
      attempt({ username: "u1", attemptedAt: "2026-08-28T04:50:00.000Z" });
      attempt({ username: "u1", attemptedAt: "2026-08-28T04:51:00.000Z" });
      attempt({ username: "u1", succeeded: true, attemptedAt: "2026-08-28T04:52:00.000Z" });
      // Both failures happened BEFORE the success and are still within the 15-min window,
      // but AC4 requires the count to be zero right after a success, not to wait for them
      // to age out on their own.
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(0);
    });

    it("counts a failure that happens AFTER a success normally", () => {
      attempt({ username: "u1", succeeded: true, attemptedAt: "2026-08-28T04:50:00.000Z" });
      attempt({ username: "u1", attemptedAt: "2026-08-28T04:55:00.000Z" });
      expect(countRecentFailuresByUsername(db, "u1", FIFTEEN_MIN_AGO)).toBe(1);
    });
  });

  describe("countRecentFailuresByIp", () => {
    it("counts failures within the window for that IP, across different usernames", () => {
      attempt({ username: "u1", ip: "203.0.113.9" });
      attempt({ username: "u2", ip: "203.0.113.9" });
      attempt({ username: "u3", ip: "203.0.113.9" });
      expect(countRecentFailuresByIp(db, "203.0.113.9", FIFTEEN_MIN_AGO)).toBe(3);
    });

    it("is scoped per IP — another IP's failures do not count", () => {
      attempt({ ip: "203.0.113.9" });
      expect(countRecentFailuresByIp(db, "203.0.113.10", FIFTEEN_MIN_AGO)).toBe(0);
    });

    it("AC4 (IP side): a username's success does NOT reset the IP's failure count", () => {
      attempt({ username: "u1", ip: "203.0.113.9" });
      attempt({ username: "u2", ip: "203.0.113.9" });
      attempt({ username: "u1", ip: "203.0.113.9", succeeded: true });
      expect(countRecentFailuresByIp(db, "203.0.113.9", FIFTEEN_MIN_AGO)).toBe(2);
    });
  });

  describe("deleteOldLoginAttempts", () => {
    it("removes rows past the cutoff, keeps rows at or after it", () => {
      recordLoginAttempt(db, {
        id: "old-1",
        username: "u1",
        ip: "203.0.113.1",
        succeeded: false,
        attemptedAt: "2026-08-26T00:00:00.000Z", // > 24h before NOW
      });
      recordLoginAttempt(db, {
        id: "recent-1",
        username: "u1",
        ip: "203.0.113.1",
        succeeded: false,
        attemptedAt: NOW,
      });

      const cutoff = "2026-08-27T05:00:00.000Z"; // 24h before NOW
      const removed = deleteOldLoginAttempts(db, cutoff);

      expect(removed).toBe(1);
      const remaining = db.prepare("SELECT id FROM login_attempts").all() as { id: string }[];
      expect(remaining.map((r) => r.id)).toEqual(["recent-1"]);
    });
  });
});
