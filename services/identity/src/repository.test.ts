import type { Database } from "better-sqlite3";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "./testing/db.js";
import {
  countUsers,
  deleteExpiredSessions,
  deleteSessionById,
  deleteSessionByTokenHash,
  findSessionWithUserByTokenHash,
  findUserByUsername,
  identityTablesExist,
  insertSession,
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

  it("seeds exactly the 4 demo accounts (3 mock ACCOUNTS + disabled)", async () => {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    expect(countUsers(db)).toBe(4);
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
    expect(countUsers(db)).toBe(4);
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
