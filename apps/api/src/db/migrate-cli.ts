/**
 * `pnpm --filter @ai-km/api migrate` (E04-S040).
 *
 * The explicit deploy step that production uses instead of migrating on
 * startup. Prints what it applied — "already up to date" and "applied three
 * files" must not look the same in a deploy log.
 */
import { loadConfig } from "../config.js";
import { openDatabase } from "./index.js";
import { MigrationError, resolveMigrationsDir, runMigrations } from "./migrate.js";

function main(): void {
  const config = loadConfig();
  const dir = resolveMigrationsDir();
  const db = openDatabase(config.dbPath);
  try {
    const applied = runMigrations(db, dir);
    if (applied.length === 0) {
      process.stdout.write(`[@ai-km/api] 資料庫已是最新,無待套用的 migration(${config.dbPath})。\n`);
      return;
    }
    process.stdout.write(
      `[@ai-km/api] 已套用 ${applied.length} 個 migration(${config.dbPath}):\n` +
        applied.map((name) => `  - ${name}\n`).join(""),
    );
  } catch (error) {
    if (error instanceof MigrationError) {
      process.stderr.write(`[@ai-km/api] Migration 失敗:${error.message}\n`);
      process.exit(1);
    }
    throw error;
  } finally {
    db.close();
  }
}

main();
