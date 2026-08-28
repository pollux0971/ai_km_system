/**
 * Test-only helper: an in-memory `better-sqlite3` database with the REAL
 * `db/migrations/202608280002_identity.sql` applied — not a hand-copied
 * schema — so a drift between the migration and what the repository expects
 * fails a test here instead of only showing up against a real file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const IDENTITY_MIGRATION_FILE = "202608280002_identity.sql";

/** Walks up from this file to find `db/migrations`, mirroring apps/api/src/db/migrate.ts. */
export function resolveMigrationsDir(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, "db", "migrations");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 db/migrations 目錄(從 ${from} 逐層往上找)。`);
}

export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrationPath = path.join(resolveMigrationsDir(), IDENTITY_MIGRATION_FILE);
  db.exec(readFileSync(migrationPath, "utf8"));
  return db;
}
