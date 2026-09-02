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
  type SqliteStatement,
} from "../src/vector/sqlite-vec.store.js";
import { createInMemoryVectorStore, DocumentScopeConflictError } from "../src/vector/store.js";
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

/**
 * E06-S043 — same scope-guard scenarios as `src/vector/store.test.ts`, run
 * against the REAL sqlite-vec store (AC5: the two stores must behave
 * identically — "which store you are running" must never be an
 * authorization decision).
 *
 * Per the spec, direct SQL against `_vec` and `_meta` is used where that is
 * the only way to be sure, rather than trusting `store.query()` alone — a
 * previous reviewer found reasoning from source code alone produced a wrong
 * prediction about this exact area.
 */
describe("sqlite-vec store — E06-S043 re-ingest scope guard (PF2)", () => {
  function financeDocV1(documentId: string): VectorRecord[] {
    return [
      {
        chunkId: `${documentId}#0`,
        documentId,
        text: "第一段:年度預算編列作業要點",
        startOffset: 0,
        endOffset: 10,
        scopeKey: "dept:finance",
        embedding: vec([1, 0]),
      },
      {
        chunkId: `${documentId}#1`,
        documentId,
        text: "第二段:資本支出核准門檻",
        startOffset: 10,
        endOffset: 20,
        scopeKey: "dept:finance",
        embedding: vec([0.9, 0.1]),
      },
    ];
  }

  it("AC1+AC2 ★ 不同 scope 重匯被拒,直接查 _vec/_meta 兩表證明:finance 逐筆不變,maintenance 一筆都沒有", async () => {
    const db = openDb(path.join(dir, "reingest-conflict.sqlite"));
    const store = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });
    const docId = "doc-conflict";
    await store.upsert(financeDocV1(docId));

    const financeScope = toRetrievalScope({ principalId: "u-fin", allowedScopeKeys: ["dept:finance"] });
    const maintenanceScope = toRetrievalScope({
      principalId: "u-maint",
      allowedScopeKeys: ["dept:maintenance"],
    });
    const before = await store.query(QUERY, financeScope, 10);
    expect(before).toHaveLength(2);

    await expect(
      store.upsert([
        {
          chunkId: `${docId}#0`,
          documentId: docId,
          text: "被拒的重匯內容",
          startOffset: 0,
          endOffset: 5,
          scopeKey: "dept:maintenance",
          embedding: vec([1, 0]),
        },
      ]),
    ).rejects.toBeInstanceOf(DocumentScopeConflictError);

    // (a) via the store's own query — item-by-item identity, not just count.
    const after = await store.query(QUERY, financeScope, 10);
    expect(after).toEqual(before);
    const maintenanceHits = await store.query(QUERY, maintenanceScope, 10);
    expect(maintenanceHits).toEqual([]);

    // (b) direct SQL against _vec and _meta — bypassing the store entirely,
    // per the spec's instruction that source-level reasoning about this area
    // has previously been wrong.
    const vecRows = db
      .prepare(`SELECT chunk_id AS chunkId, scope_key AS scopeKey FROM rag_chunks_vec WHERE chunk_id LIKE ?`)
      .all(`${docId}%`) as Array<{ chunkId: string; scopeKey: string }>;
    expect(vecRows).toHaveLength(2);
    expect(vecRows.every((r) => r.scopeKey === "dept:finance")).toBe(true);
    expect(vecRows.map((r) => r.chunkId).sort()).toEqual([`${docId}#0`, `${docId}#1`]);

    const metaRows = db
      .prepare(`SELECT chunk_id AS chunkId, text AS text FROM rag_chunks_meta WHERE document_id = ?`)
      .all(docId) as Array<{ chunkId: string; text: string }>;
    expect(metaRows).toHaveLength(2);
    expect(metaRows.some((r) => r.text === "被拒的重匯內容")).toBe(false);
  });

  it("AC6 sqlite-vec 這一側的錯誤 code 與訊息與 in-memory 一致,且不洩漏目前的 scopeKey", async () => {
    const db = openDb(path.join(dir, "reingest-message.sqlite"));
    const store = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });
    const docId = "doc-message";
    await store.upsert(financeDocV1(docId));

    try {
      await store.upsert([
        {
          chunkId: `${docId}#0`,
          documentId: docId,
          text: "x",
          startOffset: 0,
          endOffset: 1,
          scopeKey: "dept:maintenance",
          embedding: vec([1, 0]),
        },
      ]);
      expect.unreachable("must throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentScopeConflictError);
      const e = err as DocumentScopeConflictError;
      expect(e.code).toBe("DOCUMENT_SCOPE_CONFLICT");
      expect(e.message).not.toBe("匯入失敗");
      expect(e.message).not.toContain("dept:finance");
      expect(e.message).not.toContain("dept:maintenance");
    }
  });

  it("AC3 ★ 相同 scope 重匯較短版本 → 直接查 _vec/_meta 證明舊的多餘 chunk 真的被刪除,不是只是查不到", async () => {
    const db = openDb(path.join(dir, "reingest-shrink.sqlite"));
    const store = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });
    const docId = "doc-shrink";
    await store.upsert(financeDocV1(docId)); // 2 chunks

    await store.upsert([
      {
        chunkId: `${docId}#0`,
        documentId: docId,
        text: "合併後的單一段落",
        startOffset: 0,
        endOffset: 8,
        scopeKey: "dept:finance",
        embedding: vec([1, 0]),
      },
    ]);

    expect(await store.count()).toBe(1);

    const vecRows = db
      .prepare(`SELECT chunk_id AS chunkId FROM rag_chunks_vec WHERE chunk_id LIKE ?`)
      .all(`${docId}%`) as Array<{ chunkId: string }>;
    expect(vecRows.map((r) => r.chunkId)).toEqual([`${docId}#0`]);

    const metaRows = db
      .prepare(`SELECT chunk_id AS chunkId FROM rag_chunks_meta WHERE document_id = ?`)
      .all(docId) as Array<{ chunkId: string }>;
    expect(metaRows.map((r) => r.chunkId)).toEqual([`${docId}#0`]);

    const scope = toRetrievalScope({ principalId: "u-fin", allowedScopeKeys: ["dept:finance"] });
    const hits = await store.query(QUERY, scope, 10);
    expect(hits.map((h) => h.chunkId)).toEqual([`${docId}#0`]);
    expect(hits[0]?.text).toBe("合併後的單一段落");
  });

  it("AC4 ★ 替換途中真的失敗(注入的 I/O 錯誤,非驗證階段)→ ROLLBACK,新舊不混合", async () => {
    const file = path.join(dir, "reingest-atomic-fail.sqlite");
    const db = openDb(file);
    const docId = "doc-atomic";
    const seedStore = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });
    const oldRecords = financeDocV1(docId);
    await seedStore.upsert(oldRecords);

    // A db proxy where the SECOND call to INSERT INTO rag_chunks_vec throws —
    // simulating a genuine failure partway through the transaction, not a
    // Phase-1 validation rejection. Everything else passes straight through
    // to the SAME underlying connection, so BEGIN/COMMIT/ROLLBACK apply to
    // the real data seeded above.
    let insertVecCalls = 0;
    const faulty: SqliteDatabase = {
      prepare: (sql: string) => {
        const real = db.prepare(sql);
        if (sql.trim().startsWith("INSERT INTO rag_chunks_vec")) {
          const wrapped: SqliteStatement = {
            run: (...params: unknown[]) => {
              insertVecCalls += 1;
              if (insertVecCalls === 2) {
                throw new Error("simulated mid-transaction I/O failure");
              }
              return real.run(...params);
            },
            all: (...params: unknown[]) => real.all(...params) as unknown[],
            get: (...params: unknown[]) => real.get(...params),
          };
          return wrapped as unknown as ReturnType<SqliteDatabase["prepare"]>;
        }
        return real as unknown as ReturnType<SqliteDatabase["prepare"]>;
      },
      exec: (sql: string) => db.exec(sql),
      close: () => db.close(),
    };
    const faultyStore = createSqliteVecVectorStore({ db: faulty, dimensions: DIM });

    const newRecords: VectorRecord[] = [
      {
        chunkId: `${docId}#0`,
        documentId: docId,
        text: "應該從未落地的新內容 A",
        startOffset: 0,
        endOffset: 5,
        scopeKey: "dept:finance",
        embedding: vec([0.7, 0.7]),
      },
      {
        chunkId: `${docId}#1`,
        documentId: docId,
        text: "應該從未落地的新內容 B",
        startOffset: 5,
        endOffset: 10,
        scopeKey: "dept:finance",
        embedding: vec([0.6, 0.8]),
      },
    ];

    await expect(faultyStore.upsert(newRecords)).rejects.toThrow(/simulated mid-transaction/);

    // Direct SQL, same underlying connection: the ROLLBACK must have restored
    // BOTH chunks to exactly their pre-attempt state — old text, old vectors
    // — not "chunk 0 updated, chunk 1 failed" left half-applied.
    const metaRows = db
      .prepare(`SELECT chunk_id AS chunkId, text AS text FROM rag_chunks_meta WHERE document_id = ? ORDER BY chunk_id`)
      .all(docId) as Array<{ chunkId: string; text: string }>;
    expect(metaRows).toEqual([
      { chunkId: `${docId}#0`, text: oldRecords[0]!.text },
      { chunkId: `${docId}#1`, text: oldRecords[1]!.text },
    ]);

    const vecRows = db
      .prepare(`SELECT chunk_id AS chunkId FROM rag_chunks_vec WHERE chunk_id LIKE ? ORDER BY chunk_id`)
      .all(`${docId}%`) as Array<{ chunkId: string }>;
    expect(vecRows.map((r) => r.chunkId)).toEqual([`${docId}#0`, `${docId}#1`]);

    expect(await seedStore.count()).toBe(2);
  });

  it("AC5 ★ in-memory 與 sqlite-vec 對同一劇本行為一致:拒絕、finance 不變、maintenance 全空", async () => {
    const docId = "doc-parity";
    const attempt = {
      chunkId: `${docId}#0`,
      documentId: docId,
      text: "衝突內容",
      startOffset: 0,
      endOffset: 4,
      scopeKey: "dept:maintenance",
      embedding: vec([1, 0]),
    };
    const financeScope = toRetrievalScope({ principalId: "u-fin", allowedScopeKeys: ["dept:finance"] });
    const maintenanceScope = toRetrievalScope({
      principalId: "u-maint",
      allowedScopeKeys: ["dept:maintenance"],
    });

    const memory = createInMemoryVectorStore();
    await memory.upsert(financeDocV1(docId));
    const memoryBefore = await memory.query(QUERY, financeScope, 10);
    let memoryError: unknown;
    try {
      await memory.upsert([attempt]);
    } catch (e) {
      memoryError = e;
    }
    const memoryAfter = await memory.query(QUERY, financeScope, 10);
    const memoryMaintenance = await memory.query(QUERY, maintenanceScope, 10);

    const disk = createSqliteVecVectorStore({
      db: openDb(path.join(dir, "reingest-parity.sqlite")) as unknown as SqliteDatabase,
      dimensions: DIM,
    });
    await disk.upsert(financeDocV1(docId));
    const diskBefore = await disk.query(QUERY, financeScope, 10);
    let diskError: unknown;
    try {
      await disk.upsert([attempt]);
    } catch (e) {
      diskError = e;
    }
    const diskAfter = await disk.query(QUERY, financeScope, 10);
    const diskMaintenance = await disk.query(QUERY, maintenanceScope, 10);

    expect(memoryError).toBeInstanceOf(DocumentScopeConflictError);
    expect(diskError).toBeInstanceOf(DocumentScopeConflictError);
    expect((memoryError as DocumentScopeConflictError).code).toBe(
      (diskError as DocumentScopeConflictError).code,
    );
    expect(memoryAfter.map((h) => h.chunkId)).toEqual(memoryBefore.map((h) => h.chunkId));
    expect(diskAfter.map((h) => h.chunkId)).toEqual(diskBefore.map((h) => h.chunkId));
    expect(memoryMaintenance).toEqual([]);
    expect(diskMaintenance).toEqual([]);
  });
});
