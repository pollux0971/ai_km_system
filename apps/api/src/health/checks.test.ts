import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkApi,
  checkAsr,
  checkDatabase,
  checkMigrations,
  createHealthChecker,
  overallStatus,
  type SystemHealth,
} from "./checks.js";

function migrationsDirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ai-km-health-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), sql, "utf8");
  }
  return dir;
}

function dbWithSchemaMigrations(applied: readonly string[]): Database.Database {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL, checksum TEXT NOT NULL)",
  );
  const insert = db.prepare("INSERT INTO schema_migrations (name, applied_at, checksum) VALUES (?, ?, 'x')");
  for (const name of applied) insert.run(name, new Date().toISOString());
  return db;
}

describe("checkApi", () => {
  it("is always ok — reaching this code proves the process answers", () => {
    expect(checkApi()).toEqual({ name: "api", status: "ok" });
  });
});

describe("checkDatabase", () => {
  it("ok for a real file database in WAL mode", () => {
    const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "ai-km-health-db-")), "test.sqlite");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    expect(checkDatabase(db)).toEqual({ name: "database", status: "ok" });
    db.close();
  });

  it("ok for an in-memory database (SQLite cannot WAL :memory:, reports 'memory' instead)", () => {
    const db = new Database(":memory:");
    expect(checkDatabase(db)).toEqual({ name: "database", status: "ok" });
    db.close();
  });

  it("down when the connection is already closed", () => {
    const db = new Database(":memory:");
    db.close();
    const result = checkDatabase(db);
    expect(result.status).toBe("down");
    expect(result.detail).toBeTruthy();
  });
});

describe("checkMigrations", () => {
  it("ok when every disk .sql file has a matching schema_migrations row", () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;" });
    const db = dbWithSchemaMigrations(["0001_init.sql"]);
    expect(checkMigrations(db, dir)).toEqual({ name: "migrations", status: "ok" });
  });

  it("degraded, naming the pending file, when a disk file has no applied row (AC4)", () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;", "0002_new.sql": "SELECT 1;" });
    const db = dbWithSchemaMigrations(["0001_init.sql"]);
    const result = checkMigrations(db, dir);
    expect(result.status).toBe("degraded");
    expect(result.detail).toContain("0002_new.sql");
    expect(result.detail).not.toContain("0001_init.sql");
  });

  it("down when schema_migrations does not exist at all", () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;" });
    const db = new Database(":memory:");
    const result = checkMigrations(db, dir);
    expect(result.status).toBe("down");
  });

  it("ignores non-.sql files on disk", () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;", "README.md": "not a migration" });
    const db = dbWithSchemaMigrations(["0001_init.sql"]);
    expect(checkMigrations(db, dir)).toEqual({ name: "migrations", status: "ok" });
  });
});

describe("checkAsr", () => {
  let openServers: Server[] = [];
  afterEach(async () => {
    await Promise.all(openServers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    openServers = [];
  });

  it("ok for the fake provider — never touches the network", async () => {
    const result = await checkAsr({ asrProvider: "fake", asrServerUrl: "http://127.0.0.1:1" });
    expect(result).toEqual({ name: "asr", status: "ok" });
  });

  it("ok when whisper-server's /health responds 2xx", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200).end("ok");
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    openServers.push(server);
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("no server address");

    const result = await checkAsr({
      asrProvider: "whisper-server",
      asrServerUrl: `http://127.0.0.1:${address.port}`,
    });
    expect(result).toEqual({ name: "asr", status: "ok" });
  });

  it("down when whisper-server's /health responds non-2xx", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    openServers.push(server);
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("no server address");

    const result = await checkAsr({
      asrProvider: "whisper-server",
      asrServerUrl: `http://127.0.0.1:${address.port}`,
    });
    expect(result.status).toBe("down");
    expect(result.detail).toContain("503");
  });

  it("down when nothing is listening (connection refused)", async () => {
    const result = await checkAsr({ asrProvider: "whisper-server", asrServerUrl: "http://127.0.0.1:1" });
    expect(result.status).toBe("down");
  });

  it("down within the timeout when whisper-server never responds (real network, no mocked fetch)", async () => {
    const server = createServer((req) => {
      req.resume(); // never call res.end() — a wedged sidecar
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    openServers.push(server);
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("no server address");

    const start = Date.now();
    const result = await checkAsr(
      { asrProvider: "whisper-server", asrServerUrl: `http://127.0.0.1:${address.port}` },
      { timeoutMs: 200 },
    );
    expect(result.status).toBe("down");
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("overallStatus", () => {
  function healthOf(statuses: SystemHealth["subsystems"][number]["status"][]): SystemHealth {
    return {
      checkedAt: new Date().toISOString(),
      subsystems: statuses.map((status, i) => ({ name: ["api", "database", "migrations", "asr"][i]!, status }) as SystemHealth["subsystems"][number]),
    };
  }

  it("ok when every subsystem is ok", () => {
    expect(overallStatus(healthOf(["ok", "ok", "ok", "ok"]))).toBe("ok");
  });

  it("degraded when any subsystem is down", () => {
    expect(overallStatus(healthOf(["ok", "ok", "ok", "down"]))).toBe("degraded");
  });

  it("does NOT degrade for 'degraded' or 'unknown' subsystems — only 'down' does (spec AC1)", () => {
    expect(overallStatus(healthOf(["ok", "degraded", "unknown", "ok"]))).toBe("ok");
  });
});

describe("createHealthChecker (AC5 — 5s result cache, asserted via spy)", () => {
  it("does not re-run the checks on a second call within the TTL", async () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;" });
    const db = dbWithSchemaMigrations(["0001_init.sql"]);
    let nowMs = 1_000_000;
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));

    const checker = createHealthChecker({
      db,
      migrationsDir: dir,
      config: { asrProvider: "whisper-server", asrServerUrl: "http://127.0.0.1:1" },
      now: () => nowMs,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      cacheTtlMs: 5000,
    });

    const first = await checker.getHealth();
    nowMs += 1000; // still inside the 5s window
    const second = await checker.getHealth();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // same cached object, not merely equal
  });

  it("re-runs the checks once the TTL has elapsed", async () => {
    const dir = migrationsDirWith({ "0001_init.sql": "SELECT 1;" });
    const db = dbWithSchemaMigrations(["0001_init.sql"]);
    let nowMs = 1_000_000;
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));

    const checker = createHealthChecker({
      db,
      migrationsDir: dir,
      config: { asrProvider: "whisper-server", asrServerUrl: "http://127.0.0.1:1" },
      now: () => nowMs,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      cacheTtlMs: 5000,
    });

    const first = await checker.getHealth();
    nowMs += 5001; // past the 5s window
    const second = await checker.getHealth();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second.checkedAt).not.toBe(first.checkedAt);
  });
});
