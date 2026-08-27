/**
 * Migration runner (E04-S040, ADR 0003 §2).
 *
 * Plain `.sql` files in `db/migrations/`, applied in filename order, each in
 * its own transaction, recorded in `schema_migrations` with a checksum.
 *
 * The checksum is the reason this file exists rather than a three-line loop.
 * Editing a migration that has already run is one of the few ways to make two
 * environments diverge silently — every developer's database says the
 * migration ran, but they do not all have the same schema. This runner
 * refuses to continue instead.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "better-sqlite3";

export class MigrationError extends Error {
  override readonly name = "MigrationError";
}

const SCHEMA_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    checksum   TEXT NOT NULL
  ) STRICT;
`;

/** Walks up to find `db/migrations`, so it works from src/ and from dist/. */
export function resolveMigrationsDir(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(dir, "db", "migrations");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new MigrationError(
    `找不到 db/migrations 目錄(從 ${from} 逐層往上找)。apps/api 必須在 monorepo 內執行。`,
  );
}

function checksumOf(sql: string): string {
  // Line endings are normalised so a checkout with different git autocrlf
  // settings does not look like a tampered migration.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface AppliedRow {
  name: string;
  checksum: string;
}

/**
 * Applies every pending migration and returns the filenames applied (empty
 * when already up to date).
 *
 * Throws before applying ANYTHING if an already-applied migration has been
 * edited or deleted — a half-migrated database is worse than one that refused
 * to start.
 */
export function runMigrations(db: Database, dir: string): string[] {
  db.exec(SCHEMA_MIGRATIONS);

  const applied = new Map(
    db
      .prepare("SELECT name, checksum FROM schema_migrations")
      .all()
      .map((row) => [(row as AppliedRow).name, (row as AppliedRow).checksum] as const),
  );

  const files = listMigrationFiles(dir);

  // Verification pass FIRST, across every applied migration, before a single
  // pending file runs (AC3).
  for (const [name, recordedChecksum] of applied) {
    const absolute = path.join(dir, name);
    if (!existsSync(absolute)) {
      throw new MigrationError(
        `Migration 檔 "${name}" 已套用到這個資料庫,但檔案已不存在。` +
          `已套用的 migration 不得刪除——請改為新增一個新的 migration。已拒絕啟動。`,
      );
    }
    const actual = checksumOf(readFileSync(absolute, "utf8"));
    if (actual !== recordedChecksum) {
      throw new MigrationError(
        `Migration 檔 "${name}" 在套用之後被修改過(checksum 不符:` +
          `紀錄 ${recordedChecksum.slice(0, 12)}…,實際 ${actual.slice(0, 12)}…)。` +
          `已套用的 migration 內容不得變更,否則不同環境會悄悄產生不一致的 schema。` +
          `請改為新增一個新的 migration。已拒絕啟動,未套用任何後續 migration。`,
      );
    }
  }

  const pending = files.filter((name) => !applied.has(name));
  const appliedNow: string[] = [];

  for (const name of pending) {
    const sql = readFileSync(path.join(dir, name), "utf8");
    const checksum = checksumOf(sql);
    // One transaction per file: a failing migration leaves no partial schema
    // and no bookkeeping row.
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (name, applied_at, checksum) VALUES (?, ?, ?)",
      ).run(name, new Date().toISOString(), checksum);
    });
    try {
      apply();
    } catch (error) {
      throw new MigrationError(
        `Migration 檔 "${name}" 套用失敗,已回滾該檔的所有變更:${(error as Error).message}`,
      );
    }
    appliedNow.push(name);
  }

  return appliedNow;
}
