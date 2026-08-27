import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";
import { openDatabase } from "./index.js";
import { MigrationError, runMigrations, resolveMigrationsDir } from "./migrate.js";

const temps: string[] = [];
const dbs: Database[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ai-km-migrate-"));
  temps.push(dir);
  return dir;
}

function open(dir: string): Database {
  const db = openDatabase(path.join(dir, "test.sqlite"));
  dbs.push(db);
  return db;
}

afterEach(() => {
  while (dbs.length) dbs.pop()?.close();
  while (temps.length) rmSync(temps.pop() as string, { recursive: true, force: true });
});

describe("openDatabase (E04-S040 AC1)", () => {
  it("enables WAL", () => {
    const db = open(tempDir());
    expect(String(db.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
  });

  it("enables foreign key enforcement — without it ON DELETE CASCADE is inert", () => {
    const db = open(tempDir());
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("sets a busy timeout so a concurrent writer waits instead of failing instantly", () => {
    const db = open(tempDir());
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("creates the parent directory when it does not exist yet", () => {
    const dir = tempDir();
    const nested = path.join(dir, "deep", "nested", "ai-km.sqlite");
    const db = openDatabase(nested);
    dbs.push(db);
    expect(db.prepare("select 1 as ok").get()).toEqual({ ok: 1 });
  });
});

describe("runMigrations (E04-S040 AC1–AC3)", () => {
  it("applies the real repo migrations, creating every table and index", () => {
    const db = open(tempDir());
    runMigrations(db, resolveMigrationsDir());

    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("conversations");
    expect(tables).toContain("messages");
    expect(tables).toContain("change_events");
    expect(tables).toContain("schema_migrations");

    const indexes = db
      .prepare("select name from sqlite_master where type = 'index'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toContain("idx_conversations_owner_archived_last_message");
    expect(indexes).toContain("idx_messages_conversation_created");
    expect(indexes).toContain("uq_change_events_owner_seq");
  });

  it("records each applied file exactly once", () => {
    const db = open(tempDir());
    const applied = runMigrations(db, resolveMigrationsDir());
    expect(applied.length).toBeGreaterThanOrEqual(1);
    const rows = db.prepare("select name, checksum, applied_at from schema_migrations").all();
    expect(rows.length).toBe(applied.length);
    expect((rows[0] as { checksum: string }).checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent — a second run applies nothing (AC2)", () => {
    const db = open(tempDir());
    runMigrations(db, resolveMigrationsDir());
    const before = db.prepare("select name from schema_migrations order by name").all();

    const second = runMigrations(db, resolveMigrationsDir());
    expect(second).toEqual([]);
    expect(db.prepare("select name from schema_migrations order by name").all()).toEqual(before);
  });

  it("applies files in filename order, not directory order", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    // Written newest-first on purpose; a runner that trusted readdir order
    // would try to insert into a table that does not exist yet.
    writeFileSync(path.join(migrations, "202608280002_second.sql"), "insert into a (id) values (1);");
    writeFileSync(path.join(migrations, "202608280001_first.sql"), "create table a (id integer);");
    const db = open(dir);
    const applied = runMigrations(db, migrations);
    expect(applied).toEqual(["202608280001_first.sql", "202608280002_second.sql"]);
    expect(db.prepare("select id from a").all()).toEqual([{ id: 1 }]);
  });

  it("runs each migration in a transaction — a failing file leaves nothing behind", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    writeFileSync(
      path.join(migrations, "202608280001_bad.sql"),
      "create table good (id integer);\nthis is not valid sql;",
    );
    const db = open(dir);
    expect(() => runMigrations(db, migrations)).toThrow(MigrationError);
    const tables = db
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).not.toContain("good");
    expect(db.prepare("select count(*) as n from schema_migrations").get()).toEqual({ n: 0 });
  });

  // AC3 + the permanent regression test the spec asks for.
  it("REGRESSION: refuses to start when an already-applied migration was edited", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    const first = path.join(migrations, "202608280001_first.sql");
    writeFileSync(first, "create table a (id integer);");
    const db = open(dir);
    runMigrations(db, migrations);

    writeFileSync(first, "create table a (id integer, sneaky text);");
    expect(() => runMigrations(db, migrations)).toThrow(MigrationError);
    expect(() => runMigrations(db, migrations)).toThrow(/202608280001_first\.sql/);
  });

  it("names the edited file and does NOT apply any later pending file (AC3)", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    const first = path.join(migrations, "202608280001_first.sql");
    writeFileSync(first, "create table a (id integer);");
    const db = open(dir);
    runMigrations(db, migrations);

    writeFileSync(first, "create table a (id integer, sneaky text);");
    writeFileSync(path.join(migrations, "202608280002_later.sql"), "create table later (id integer);");

    expect(() => runMigrations(db, migrations)).toThrow(/202608280001_first\.sql/);
    const tables = db
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).not.toContain("later");
  });

  it("refuses when an applied migration file has been deleted from disk", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    const first = path.join(migrations, "202608280001_first.sql");
    writeFileSync(first, "create table a (id integer);");
    const db = open(dir);
    runMigrations(db, migrations);
    rmSync(first);
    expect(() => runMigrations(db, migrations)).toThrow(/202608280001_first\.sql/);
  });

  it("reports a Traditional Chinese message naming the file (UX AC)", () => {
    const dir = tempDir();
    const migrations = path.join(dir, "migrations");
    mkdirSync(migrations);
    const first = path.join(migrations, "202608280001_first.sql");
    writeFileSync(first, "create table a (id integer);");
    const db = open(dir);
    runMigrations(db, migrations);
    writeFileSync(first, "create table a (id integer, sneaky text);");
    let message = "";
    try {
      runMigrations(db, migrations);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("202608280001_first.sql");
    expect(message).toMatch(/[一-鿿]/);
  });
});

describe("conversation domain schema (AC4)", () => {
  function seeded(): Database {
    const db = open(tempDir());
    runMigrations(db, resolveMigrationsDir());
    db.prepare(
      `insert into conversations (id, owner_key, title, mode, knowledge_scopes, model, archived,
        last_message_at, last_message_preview, created_at, updated_at)
       values ('c1','o1','t','normal','[]','standard',0,'2026-08-28T00:00:00.000Z','p','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `insert into messages (id, conversation_id, owner_key, role, content, attachment_names,
        created_at, updated_at)
       values ('m1','c1','o1','user','hi','[]','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
    ).run();
    return db;
  }

  it("cascades message deletion when its conversation is deleted", () => {
    const db = seeded();
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 1 });
    db.prepare("delete from conversations where id = 'c1'").run();
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
  });

  it("rejects a message pointing at a conversation that does not exist", () => {
    const db = seeded();
    expect(() =>
      db
        .prepare(
          `insert into messages (id, conversation_id, owner_key, role, content, attachment_names,
            created_at, updated_at)
           values ('m2','ghost','o1','user','hi','[]','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it("rejects a non-JSON value in a JSON column (json_valid CHECK)", () => {
    const db = seeded();
    expect(() =>
      db
        .prepare(
          `insert into conversations (id, owner_key, title, mode, knowledge_scopes, model, archived,
            last_message_at, last_message_preview, created_at, updated_at)
           values ('c2','o1','t','normal','not-json','standard',0,'2026-08-28T00:00:00.000Z','p','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK/i);
  });

  it("rejects an out-of-range enum-ish value (mode / role / archived)", () => {
    const db = seeded();
    expect(() =>
      db
        .prepare(
          `insert into conversations (id, owner_key, title, mode, knowledge_scopes, model, archived,
            last_message_at, last_message_preview, created_at, updated_at)
           values ('c3','o1','t','telepathic','[]','standard',0,'2026-08-28T00:00:00.000Z','p','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db
        .prepare(
          `insert into messages (id, conversation_id, owner_key, role, content, attachment_names,
            created_at, updated_at)
           values ('m3','c1','o1','system','hi','[]','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK/i);
  });

  it("requires owner_key on every domain row", () => {
    const db = seeded();
    expect(() =>
      db
        .prepare(
          `insert into conversations (id, title, mode, knowledge_scopes, model, archived,
            last_message_at, last_message_preview, created_at, updated_at)
           values ('c4','t','normal','[]','standard',0,'2026-08-28T00:00:00.000Z','p','2026-08-28T00:00:00.000Z','2026-08-28T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/NOT NULL/i);
  });

  it("contains no seed rows and no secrets — a migration is schema only", () => {
    const db = open(tempDir());
    runMigrations(db, resolveMigrationsDir());
    expect(db.prepare("select count(*) as n from conversations").get()).toEqual({ n: 0 });
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
    expect(db.prepare("select count(*) as n from change_events").get()).toEqual({ n: 0 });
    const sql = readFileSync(
      path.join(resolveMigrationsDir(), "202608280001_conversation_domain.sql"),
      "utf8",
    );
    // Comments are stripped first: the point is that no secret VALUE is
    // written by the migration, and a comment that says "no secrets" is not a
    // secret. Asserting against the raw text checked the prose, not the SQL.
    const statements = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(statements).not.toMatch(/insert\s+into/i);
    expect(statements).not.toMatch(/password|secret|token/i);
  });
});

describe("database plugin wiring (E04-S040)", () => {
  it("decorates the Fastify instance with db and migrates on build", async () => {
    const dir = tempDir();
    const { buildServer } = await import("../server.js");
    const { loadConfig } = await import("../config.js");
    const app = await buildServer({
      config: loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" }),
      contractsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "testing", "fixtures"),
      dbPath: path.join(dir, "wired.sqlite"),
    });
    try {
      expect(app.db.prepare("select count(*) as n from conversations").get()).toEqual({ n: 0 });
      expect(app.db.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("does not migrate when AI_KM_AUTO_MIGRATE=false — a schema change stays a deploy decision", async () => {
    const dir = tempDir();
    const { buildServer } = await import("../server.js");
    const { loadConfig } = await import("../config.js");
    const app = await buildServer({
      config: loadConfig({
        NODE_ENV: "test",
        AI_KM_LOG_LEVEL: "silent",
        AI_KM_AUTO_MIGRATE: "false",
      }),
      contractsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "testing", "fixtures"),
      dbPath: path.join(dir, "no-migrate.sqlite"),
    });
    try {
      expect(() => app.db.prepare("select 1 from conversations").get()).toThrow(/no such table/i);
    } finally {
      await app.close();
    }
  });

  it("closes the database when the server closes", async () => {
    const dir = tempDir();
    const { buildServer } = await import("../server.js");
    const { loadConfig } = await import("../config.js");
    const app = await buildServer({
      config: loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" }),
      contractsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "testing", "fixtures"),
      dbPath: path.join(dir, "closed.sqlite"),
    });
    const db = app.db;
    await app.close();
    // better-sqlite3 phrases this as "The database connection is not open".
    expect(() => db.prepare("select 1").get()).toThrow(/not open/i);
  });
});
