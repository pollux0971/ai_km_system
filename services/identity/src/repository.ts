/**
 * `users` / `sessions` repository (E02-S032, `db/migrations/202608280002_identity.sql`).
 *
 * Plain prepared statements, not the `prepareOwnerScoped` guard
 * `@ai-km/service-conversation` uses: that guard exists so a DOMAIN cannot
 * forget to scope a query to the owner whose data it is reading. Every query
 * here is identity's OWN bookkeeping tables (`users`, `sessions`), which
 * `owner_key` is minted FROM, not filtered BY — there is no "another user's
 * row" to leak through a missing predicate the way there would be in a
 * domain table.
 */
import type { Database } from "better-sqlite3";
import type { Role } from "@ai-km/permissions";
import { hashPassword } from "./crypto.js";
import type { IdentityConfig } from "./config.js";

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly password_hash: string;
  readonly password_salt: string;
  readonly name: string;
  readonly email: string;
  readonly department: string;
  readonly group_name: string;
  /** JSON-encoded array of role name strings. */
  readonly roles: string;
  readonly disabled: 0 | 1;
  readonly created_at: string;
}

export interface SessionWithUserRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly owner_key: string;
  readonly last_seen_at: string;
  readonly expires_at: string;
  readonly roles: string;
  readonly disabled: 0 | 1;
  readonly name: string;
  readonly email: string;
  readonly department: string;
  readonly group_name: string;
}

/**
 * `apps/api` supports starting with `AI_KM_AUTO_MIGRATE=false` (migrations
 * run as an explicit separate deploy step — see db/plugin.ts). Registration
 * must not crash a server that starts in that state before migrations have
 * run; every entry point that touches `users`/`sessions` at REGISTRATION
 * time (seeding, the startup/hourly sweep) checks this first and no-ops when
 * false. Request-time queries (the actual routes) are not guarded — hitting
 * them before migrating is a real SqliteError, which is the correct signal.
 */
export function identityTablesExist(db: Database): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as unknown;
  return row !== undefined;
}

export function findUserByUsername(db: Database, username: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function countUsers(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n;
}

export interface NewSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly ownerKey: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
}

export function insertSession(db: Database, session: NewSession): void {
  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, owner_key, created_at, last_seen_at, expires_at)
     VALUES (@id, @tokenHash, @userId, @ownerKey, @createdAt, @lastSeenAt, @expiresAt)`,
  ).run(session);
}

export function findSessionWithUserByTokenHash(
  db: Database,
  tokenHash: string,
): SessionWithUserRow | undefined {
  return db
    .prepare(
      `SELECT s.id AS session_id, s.user_id, s.owner_key, s.last_seen_at, s.expires_at,
              u.roles, u.disabled, u.name, u.email, u.department, u.group_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as SessionWithUserRow | undefined;
}

export function touchSession(db: Database, sessionId: string, lastSeenAt: string): void {
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(lastSeenAt, sessionId);
}

export function deleteSessionById(db: Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteSessionByTokenHash(db: Database, tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

/**
 * Removes sessions past their absolute expiry OR past the idle cutoff.
 * Returns the number of rows removed (for startup/hourly-sweep logging).
 */
export function deleteExpiredSessions(db: Database, nowIso: string, idleCutoffIso: string): number {
  const result = db
    .prepare("DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?")
    .run(nowIso, idleCutoffIso);
  return result.changes;
}

interface DemoAccountSeed {
  readonly id: string;
  readonly username: string;
  readonly password: string;
  readonly name: string;
  readonly email: string;
  readonly department: string;
  readonly group: string;
  /** Must come from `@ai-km/permissions`'s `Role` union (E02-S033: type-checked, not a bare string). */
  readonly roles: readonly Role[];
  readonly disabled: boolean;
}

/**
 * Field-for-field `packages/auth-client/src/mock.ts`'s `ACCOUNTS` (per AC8 /
 * the story's Scope), plus one disabled account exercising `ACCOUNT_DISABLED`
 * — the mock's `username === "disabled"` trigger has no ACCOUNTS entry of
 * its own to copy, so this row's shape is this story's to define — plus
 * (E02-S033) one admin account per remaining `Role`, one role each, so
 * `requireAnyRole` has a real account to prove every role in isolation
 * against.
 */
const DEMO_ACCOUNTS: readonly DemoAccountSeed[] = [
  {
    id: "mock-user-1",
    username: "demo-user",
    password: "demo-pass-123",
    name: "示範使用者",
    email: "demo-user@example.com",
    department: "資訊部",
    group: "一般使用者群組",
    roles: ["general_user"],
    disabled: false,
  },
  {
    id: "mock-user-maintenance",
    username: "demo-maintenance",
    password: "demo-pass-123",
    name: "示範維修工程師",
    email: "demo-maintenance@example.com",
    department: "維修部",
    group: "維修工程師群組",
    roles: ["maintenance_engineer"],
    disabled: false,
  },
  {
    id: "mock-user-sales",
    username: "demo-sales",
    password: "demo-pass-123",
    name: "示範業務",
    email: "demo-sales@example.com",
    department: "業務部",
    group: "業務群組",
    roles: ["sales_purchasing"],
    disabled: false,
  },
  {
    id: "mock-user-disabled",
    username: "disabled",
    password: "demo-pass-123",
    name: "示範已停用帳號",
    email: "disabled@example.com",
    department: "資訊部",
    group: "一般使用者群組",
    roles: ["general_user"],
    disabled: true,
  },
  {
    id: "mock-user-super",
    username: "demo-super",
    password: "demo-pass-123",
    name: "示範最高管理員",
    email: "demo-super@example.com",
    department: "資訊部",
    group: "系統管理群組",
    roles: ["super_administrator"],
    disabled: false,
  },
  {
    id: "mock-user-it-admin",
    username: "demo-it",
    password: "demo-pass-123",
    name: "示範資訊管理員",
    email: "demo-it@example.com",
    department: "資訊部",
    group: "系統管理群組",
    roles: ["it_administrator"],
    disabled: false,
  },
  {
    id: "mock-user-ai-admin",
    username: "demo-ai",
    password: "demo-pass-123",
    name: "示範 AI 管理員",
    email: "demo-ai@example.com",
    department: "資訊部",
    group: "系統管理群組",
    roles: ["ai_administrator"],
    disabled: false,
  },
  {
    id: "mock-user-auditor",
    username: "demo-auditor",
    password: "demo-pass-123",
    name: "示範稽核人員",
    email: "demo-auditor@example.com",
    department: "稽核部",
    group: "稽核群組",
    roles: ["auditor"],
    disabled: false,
  },
  {
    id: "mock-user-km",
    username: "demo-km",
    password: "demo-pass-123",
    name: "示範知識管理員",
    email: "demo-km@example.com",
    department: "知識管理部",
    group: "知識管理群組",
    roles: ["knowledge_manager"],
    disabled: false,
  },
  {
    id: "mock-user-manager",
    username: "demo-manager",
    password: "demo-pass-123",
    name: "示範部門主管",
    email: "demo-manager@example.com",
    department: "業務部",
    group: "部門主管群組",
    roles: ["department_manager"],
    disabled: false,
  },
];

/**
 * Creates the demo accounts, but only when `users` is empty AND
 * `config.seedDemoUsers` is on (AC8: idempotent across restarts — a
 * non-empty table is the "already seeded" signal, so no upsert is needed).
 */
export async function seedDemoUsers(
  db: Database,
  config: Pick<IdentityConfig, "seedDemoUsers">,
  nowIso: string,
): Promise<void> {
  if (!config.seedDemoUsers) return;
  if (countUsers(db) > 0) return;

  const insert = db.prepare(
    `INSERT INTO users (id, username, password_hash, password_salt, name, email, department, group_name, roles, disabled, created_at)
     VALUES (@id, @username, @password_hash, @password_salt, @name, @email, @department, @group_name, @roles, @disabled, @created_at)`,
  );

  for (const account of DEMO_ACCOUNTS) {
    const { hash, salt } = await hashPassword(account.password);
    insert.run({
      id: account.id,
      username: account.username,
      password_hash: hash,
      password_salt: salt,
      name: account.name,
      email: account.email,
      department: account.department,
      group_name: account.group,
      roles: JSON.stringify(account.roles),
      disabled: account.disabled ? 1 : 0,
      created_at: nowIso,
    });
  }
}
