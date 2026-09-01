/**
 * PF2 — the sqlite-vec store, against a real file on disk.
 *
 * WHAT THIS PROVES: real SQL, real Float32 serialisation, a real migration, a
 * real file that survives a reopen, and authorization applied INSIDE the KNN
 * search rather than after it.
 *
 * WHAT IT DOES NOT PROVE: anything about vector quality. Every vector here is
 * hand-written; the embedding model is not involved. `requireProviderFidelity`
 * enforces that claim in AC-V0 rather than leaving it in this comment.
 *
 * `AC-V6` is the load-bearing one. It runs the OLD query shape side by side
 * with the new one on the same data, so "we fixed it" is a measurement rather
 * than an assertion.
 */
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { Database } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterAll, describe, expect, it } from "vitest";

import {
  createSqliteVecVectorStore,
  PartitionOverlapError,
  type SqliteDatabase,
} from "../src/vector/sqlite-vec.store.js";
import { createInMemoryVectorStore } from "../src/vector/store.js";
import { toRetrievalScope } from "../src/authorization/scope.js";
import { requireProviderFidelity } from "../src/evidence-tier.js";
import type { VectorRecord } from "../src/vector/store.js";

const DIM = 2;
const dir = mkdtempSync(path.join(tmpdir(), "rag-sqlite-vec-"));
const opened: Database[] = [];

afterAll(() => {
  for (const db of opened) {
    try {
      db.close();
    } catch {
      /* already closed by store.close() */
    }
  }
});

function openDb(file: string): Database {
  const db = new BetterSqlite3(file);
  sqliteVec.load(db);
  opened.push(db);
  return db;
}

const vec = (a: readonly number[]): Float32Array => Float32Array.from(a);

function record(
  chunkId: string,
  scopeKey: string,
  embedding: readonly number[],
  documentId = chunkId.split("#")[0] ?? chunkId,
): VectorRecord {
  return {
    chunkId,
    documentId,
    text: `${chunkId} 的內容`,
    startOffset: 0,
    endOffset: 10,
    scopeKey,
    embedding: vec(embedding),
  };
}

/**
 * The dataset that exposes KNN-then-filter. The three finance chunks are all
 * strictly nearer the query than either maintenance chunk, so a global top-3
 * followed by a scope filter leaves a maintenance-only principal with nothing.
 */
const CROWD_OUT_RECORDS: readonly VectorRecord[] = [
  record("f1", "dept:finance", [1, 0]),
  record("f2", "dept:finance", [0.99, 0.1]),
  record("f3", "dept:finance", [0.98, 0.15]),
  record("m1", "dept:maintenance", [0.5, 0.8]),
  record("m2", "dept:maintenance", [0.4, 0.9]),
  record("h1", "dept:hr", [0, 1]),
];
const QUERY = vec([1, 0]);

describe("sqlite-vec store — PF2", () => {
  it("AC-V0 (PF2) 本檔宣稱 PF2,元件也只能支撐到 PF2", () => {
    const db = openDb(path.join(dir, "tier.sqlite"));
    const store = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });
    expect(store.fidelityCeiling).toBe("PF2");
    expect(() => requireProviderFidelity("PF2", [store])).not.toThrow();
    expect(() => requireProviderFidelity("PF3", [store])).toThrow(/PF3/);
  });

  it("AC-V1 (PF2) 資料真的落到磁碟", async () => {
    const file = path.join(dir, "persist.sqlite");
    const store = createSqliteVecVectorStore({
      db: openDb(file) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await store.upsert(CROWD_OUT_RECORDS);

    expect(await store.count()).toBe(6);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
    await store.close();
  });

  it("AC-V2 (PF2) 重開之後資料還在,且向量沒有在序列化途中壞掉", async () => {
    const file = path.join(dir, "reopen.sqlite");
    const first = createSqliteVecVectorStore({
      db: openDb(file) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await first.upsert(CROWD_OUT_RECORDS);
    await first.close();

    // A brand new connection to the same file — nothing is cached in process.
    const second = createSqliteVecVectorStore({
      db: openDb(file) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    expect(await second.count()).toBe(6);

    const scope = toRetrievalScope({
      principalId: "u-fin",
      allowedScopeKeys: ["dept:finance"],
    });
    const hits = await second.query(QUERY, scope, 3);
    expect(hits.map((h) => h.chunkId)).toEqual(["f1", "f2", "f3"]);
    // Offsets and text survived the round trip, so a citation can still be located.
    expect(hits[0]?.startOffset).toBe(0);
    expect(hits[0]?.endOffset).toBe(10);
    expect(hits[0]?.text).toBe("f1 的內容");
  });

  it("AC-V3 (PF2) 未授權部門的資料不出現在結果中", async () => {
    const store = createSqliteVecVectorStore({
      db: openDb(path.join(dir, "scope.sqlite")) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await store.upsert(CROWD_OUT_RECORDS);

    const hits = await store.query(
      QUERY,
      toRetrievalScope({ principalId: "u-m", allowedScopeKeys: ["dept:maintenance"] }),
      10,
    );
    expect(hits.map((h) => h.scopeKey)).toEqual(["dept:maintenance", "dept:maintenance"]);
    expect(hits.map((h) => h.chunkId)).toEqual(["m1", "m2"]);
  });

  it("AC-V3b (PF2) 空授權範圍 = 拒絕全部,而且一次 SQL 都不發", async () => {
    const db = openDb(path.join(dir, "denyall.sqlite"));
    const store = createSqliteVecVectorStore({
      db: db as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await store.upsert(CROWD_OUT_RECORDS);

    let prepared = 0;
    const counting: SqliteDatabase = {
      prepare: (sql: string) => {
        prepared += 1;
        return db.prepare(sql) as unknown as ReturnType<SqliteDatabase["prepare"]>;
      },
      exec: (sql: string) => db.exec(sql),
      close: () => db.close(),
    };
    const counted = createSqliteVecVectorStore({ db: counting, dimensions: DIM });
    const preparedAfterConstruction = prepared;

    const hits = await counted.query(
      QUERY,
      toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] }),
      5,
    );
    expect(hits).toEqual([]);
    expect(prepared).toBe(preparedAfterConstruction);
  });

  it("AC-V4 (PF2) 多部門授權拿到的是真正的授權 top-k,不是每個 partition 各 k 筆", async () => {
    const store = createSqliteVecVectorStore({
      db: openDb(path.join(dir, "merge.sqlite")) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    // 10 maintenance chunks spanning near→far, 10 hr chunks all mid-range.
    const many: VectorRecord[] = [];
    for (let i = 0; i < 10; i += 1) many.push(record(`m${i}`, "dept:maintenance", [1 - i * 0.05, i * 0.05]));
    for (let i = 0; i < 10; i += 1) many.push(record(`h${i}`, "dept:hr", [0.6 - i * 0.01, 0.4 + i * 0.01]));
    await store.upsert(many);

    const hits = await store.query(
      QUERY,
      toRetrievalScope({ principalId: "u-mh", allowedScopeKeys: ["dept:maintenance", "dept:hr"] }),
      4,
    );
    // Exactly k rows — a per-partition-k concatenation would return 8.
    expect(hits).toHaveLength(4);
    expect(hits.map((h) => h.chunkId)).toEqual(["m0", "m1", "m2", "m3"]);
    // And globally ordered, best first.
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("AC-V4b (PF2) 授權清單重複不會誤觸 partition 互斥檢查", async () => {
    const store = createSqliteVecVectorStore({
      db: openDb(path.join(dir, "dupscope.sqlite")) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await store.upsert(CROWD_OUT_RECORDS);

    const hits = await store.query(
      QUERY,
      toRetrievalScope({
        principalId: "u-dup",
        allowedScopeKeys: ["dept:maintenance", "dept:maintenance"],
      }),
      5,
    );
    expect(hits.map((h) => h.chunkId)).toEqual(["m1", "m2"]);
  });

  it("AC-V5 (PF2) 排序與 in-memory store 一致,含分數相同時的 chunkId 決勝", async () => {
    // Two chunks at the identical position: only the chunkId tiebreak can order them.
    const tied: readonly VectorRecord[] = [
      record("b-tied", "dept:maintenance", [1, 0]),
      record("a-tied", "dept:maintenance", [1, 0]),
      record("z-far", "dept:maintenance", [0, 1]),
    ];
    const scope = toRetrievalScope({
      principalId: "u-m",
      allowedScopeKeys: ["dept:maintenance"],
    });

    const memory = createInMemoryVectorStore();
    await memory.upsert(tied);
    const memoryHits = await memory.query(QUERY, scope, 3);

    const disk = createSqliteVecVectorStore({
      db: openDb(path.join(dir, "tie.sqlite")) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await disk.upsert(tied);
    const diskHits = await disk.query(QUERY, scope, 3);

    expect(diskHits.map((h) => h.chunkId)).toEqual(memoryHits.map((h) => h.chunkId));
    expect(diskHits.map((h) => h.chunkId)).toEqual(["a-tied", "b-tied", "z-far"]);
  });

  it("AC-V6 (PF2) ★ 不得退回 JOIN 後濾:同一份資料,舊寫法回空集合,新寫法不會", async () => {
    const db = openDb(path.join(dir, "regression.sqlite"));
    const store = createSqliteVecVectorStore({
      db: db as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await store.upsert(CROWD_OUT_RECORDS);

    const scope = toRetrievalScope({
      principalId: "u-m",
      allowedScopeKeys: ["dept:maintenance"],
    });

    // (a) The shape this store used before 2026-09-02, rebuilt verbatim: scope
    //     lived in the side table and vec0 knew nothing about it, so vec0
    //     computed the GLOBAL top-k and the JOIN filtered afterwards.
    //
    //     It has to be a separate pair of tables. Pointing the old query at the
    //     new schema proves nothing — `scope_key` is a partition key there, so
    //     vec0 pre-filters and the query "works". The bug was the SCHEMA, not
    //     the SQL text, and this is what makes that visible.
    db.exec(
      `CREATE TABLE legacy_meta (
         chunk_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, text TEXT NOT NULL,
         start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL, scope_key TEXT NOT NULL);
       CREATE VIRTUAL TABLE legacy_vec USING vec0(
         chunk_id TEXT PRIMARY KEY, embedding FLOAT[${DIM}]);`,
    );
    const lm = db.prepare(
      `INSERT INTO legacy_meta VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const lv = db.prepare(`INSERT INTO legacy_vec (chunk_id, embedding) VALUES (?, ?)`);
    for (const r of CROWD_OUT_RECORDS) {
      lm.run(r.chunkId, r.documentId, r.text, r.startOffset, r.endOffset, r.scopeKey);
      lv.run(r.chunkId, Buffer.from(r.embedding.buffer.slice(0)));
    }

    const legacy = db
      .prepare(
        `SELECT m.chunk_id AS chunkId, m.scope_key AS scopeKey, v.distance AS distance
           FROM legacy_vec v
           JOIN legacy_meta m ON m.chunk_id = v.chunk_id
          WHERE v.embedding MATCH ?
            AND k = ?
            AND m.scope_key IN (?)
          ORDER BY v.distance`,
      )
      .all(Buffer.from(vec([1, 0]).buffer), 3, "dept:maintenance") as unknown[];

    // The engineer is authorised for two maintenance chunks and gets none.
    expect(legacy).toHaveLength(0);

    // (b) The current implementation, same data, same k.
    const hits = await store.query(QUERY, scope, 3);
    expect(hits.map((h) => h.chunkId)).toEqual(["m1", "m2"]);
    expect(hits.length).toBeGreaterThan(legacy.length);
  });

  it("AC-V7 (PF2) vec0 的 chunk_id PRIMARY KEY 是全域唯一 —— PartitionOverlapError 之所以還打不到", () => {
    const db = openDb(path.join(dir, "pk.sqlite"));
    db.exec(
      `CREATE VIRTUAL TABLE pk_probe USING vec0(
         chunk_id TEXT PRIMARY KEY, scope_key TEXT PARTITION KEY, embedding FLOAT[${DIM}]);`,
    );
    const insert = db.prepare(`INSERT INTO pk_probe (chunk_id, scope_key, embedding) VALUES (?, ?, ?)`);
    insert.run("c1", "dept:a", Buffer.from(vec([1, 0]).buffer));

    // If a future sqlite-vec makes the primary key per-partition, this goes red
    // — which is exactly when PartitionOverlapError stops being unreachable and
    // starts being the thing standing between a chunk and a scope it does not
    // belong to. The guard is not dead code; it is armed for that day.
    expect(() => insert.run("c1", "dept:b", Buffer.from(vec([0, 1]).buffer))).toThrow(
      /UNIQUE constraint/,
    );
    expect(new PartitionOverlapError("probe").name).toBe("PartitionOverlapError");
  });
});
