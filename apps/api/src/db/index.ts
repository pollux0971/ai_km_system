/**
 * SQLite connection for apps/api (E04-S040, ADR 0003 §2).
 *
 * One file, one process, `better-sqlite3`'s synchronous API. Synchronous is
 * the right call here rather than a limitation: SQLite writes serialise
 * anyway, and a synchronous driver means a repository function that reads and
 * then writes cannot be interleaved with another request halfway through.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type { Database } from "better-sqlite3";

export interface OpenDatabaseOptions {
  /** Passed through to better-sqlite3; tests use it to assert on statements. */
  readonly readonly?: boolean;
}

export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): Database.Database {
  if (filePath !== ":memory:") {
    // A missing parent directory is the single most common first-run failure;
    // creating it is cheaper than making every operator read a stack trace.
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }

  const db = new Database(filePath, { readonly: options.readonly ?? false });

  // WAL: readers do not block the writer, which matters as soon as an SSE
  // stream is polling while a request writes.
  db.pragma("journal_mode = WAL");
  // Without this, every ON DELETE CASCADE in the schema is silently inert.
  // SQLite defaults it OFF, per connection — so it must be set here, not in a
  // migration.
  db.pragma("foreign_keys = ON");
  // Wait for a competing writer rather than failing the request outright.
  db.pragma("busy_timeout = 5000");

  return db;
}
