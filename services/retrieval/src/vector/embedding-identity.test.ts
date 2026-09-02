/**
 * E06-S026 — embedding model/version metadata: a query whose embedding
 * provider disagrees with (or cannot find) the identity recorded on the
 * indexed vectors it would otherwise rank against must be REFUSED, not
 * silently scored.
 *
 * This is a NEW file — it adds tests, it does not touch any existing one.
 * `store.test.ts` and `tests/sqlite-vec-store.integration.test.ts` are
 * E06-S043's frozen files and are untouched (verified separately in
 * EVIDENCE); this file exercises the SAME two `VectorStore` implementations
 * from the outside, through their public `upsert()`/`query()` contract, the
 * same way those files do.
 *
 * WHY "SAME DIMENSIONS, DIFFERENT MODEL" IS THE TEST THAT MATTERS MOST: a
 * dimensions mismatch was already caught before this story (`dot()` in
 * `../embedding/provider.ts` throws on mismatched vector lengths — see
 * `service.test.ts`'s AC-R5). The dangerous case this story exists to close
 * is the one dimensions checking CANNOT catch: two different embedding
 * functions that happen to produce vectors of the same length. Every
 * mismatch scenario below therefore uses IDENTICAL dimensions and only
 * varies `model`, so a regression that silently degrades this story's check
 * back into "just compare dimensions" cannot pass these tests by accident.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { Database } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterAll, describe, expect, it } from "vitest";

import {
  createInMemoryVectorStore,
  EmbeddingVersionMismatchError,
  type EmbeddingIdentity,
  type VectorRecord,
} from "./store.js";
import {
  createSqliteVecVectorStore,
  migrateEmbeddingIdentityColumns,
  type SqliteDatabase,
} from "./sqlite-vec.store.js";
import { toRetrievalScope } from "../authorization/scope.js";
import { createRetrievalService } from "../service.js";
import type { EmbeddingProvider } from "../embedding/provider.js";

const DIM = 2;
const QUERY = Float32Array.from([1, 0]);
const SCOPE = toRetrievalScope({ principalId: "u-1", allowedScopeKeys: ["dept:eng"] });

function record(
  chunkId: string,
  embedding: readonly number[],
  identity?: EmbeddingIdentity,
): VectorRecord {
  return {
    chunkId,
    documentId: chunkId.split("#")[0] ?? chunkId,
    text: `${chunkId} 的內容`,
    startOffset: 0,
    endOffset: 10,
    scopeKey: "dept:eng",
    embedding: Float32Array.from(embedding),
    ...(identity ? { embeddingModel: identity.model, embeddingDimensions: identity.dimensions } : {}),
  };
}

const IDENTITY_A: EmbeddingIdentity = { model: "provider-a", dimensions: DIM };
const IDENTITY_B: EmbeddingIdentity = { model: "provider-b", dimensions: DIM };

/** A minimal, fully-controlled `EmbeddingProvider` — model and dimensions are exactly what the test says, independent of the deterministic provider's own fixed model string. */
function fakeEmbeddingProvider(identity: EmbeddingIdentity, vector: readonly number[]): EmbeddingProvider {
  return {
    componentId: `embedding:fake:${identity.model}`,
    fidelityCeiling: "PF1",
    model: identity.model,
    dimensions: identity.dimensions,
    async embed(texts) {
      return texts.map(() => Float32Array.from(vector));
    },
  };
}

const dir = mkdtempSync(path.join(tmpdir(), "embedding-identity-"));
const opened: Database[] = [];
afterAll(() => {
  for (const db of opened) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
});
function openDb(file: string): Database {
  const db = new BetterSqlite3(file);
  sqliteVec.load(db);
  opened.push(db);
  return db;
}

describe.each([
  ["in-memory", () => createInMemoryVectorStore()],
  [
    "sqlite-vec",
    () =>
      createSqliteVecVectorStore({
        db: openDb(path.join(dir, `${Math.random().toString(36).slice(2)}.sqlite`)) as unknown as SqliteDatabase,
        dimensions: DIM,
      }),
  ],
] as const)("embedding identity — %s store", (_label, makeStore) => {
  it("AC1 ★ 索引時的 provider 身分逐值持久化,query() 回傳的 hit 帶回相同的 model/dimensions", async () => {
    const store = makeStore();
    await store.upsert([record("doc-1#0", [1, 0], IDENTITY_A)]);

    const hits = await store.query(QUERY, SCOPE, 10);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.embeddingModel).toBe("provider-a");
    expect(hits[0]!.embeddingDimensions).toBe(DIM);
  });

  it("AC4 ★ 索引與查詢同一身分 → 正常檢索,結果不受影響", async () => {
    const store = makeStore();
    await store.upsert([
      record("doc-1#0", [1, 0], IDENTITY_A),
      record("doc-1#1", [0.9, 0.1], IDENTITY_A),
    ]);

    const hits = await store.query(QUERY, SCOPE, 10, IDENTITY_A);
    expect(hits.map((h) => h.chunkId)).toEqual(["doc-1#0", "doc-1#1"]);
  });

  it(
    "AC3 ★ 索引 provider A、查詢 provider B(維度完全相同,只有 model 不同)" +
      "→ 拒絕檢索,不回傳任何結果,訊息同時指出兩邊身分",
    async () => {
      const store = makeStore();
      await store.upsert([record("doc-1#0", [1, 0], IDENTITY_A)]);

      let thrown: unknown;
      let hits: unknown;
      try {
        hits = await store.query(QUERY, SCOPE, 10, IDENTITY_B);
      } catch (err) {
        thrown = err;
      }

      expect(hits).toBeUndefined();
      expect(thrown).toBeInstanceOf(EmbeddingVersionMismatchError);
      const message = (thrown as Error).message;
      expect(message).toContain(IDENTITY_A.model);
      expect(message).toContain(IDENTITY_B.model);
    },
  );

  it("AC5 ★ 索引資料沒有記錄身分(欄位缺失)→ 視為未知,查詢被拒絕而非當成相容", async () => {
    const store = makeStore();
    // No identity supplied at all — mirrors data written before this story,
    // or through a caller that skipped the ingestion pipeline entirely.
    await store.upsert([record("doc-1#0", [1, 0])]);

    await expect(store.query(QUERY, SCOPE, 10, IDENTITY_A)).rejects.toBeInstanceOf(
      EmbeddingVersionMismatchError,
    );
    // Without an expectedIdentity, the SAME unidentified data is still
    // readable — this is what makes "unknown" a REFUSAL specifically at
    // query time when a comparison is requested, not a write-time
    // corruption of the data itself.
    const hits = await store.query(QUERY, SCOPE, 10);
    expect(hits).toHaveLength(1);
  });

  it("AC6 ★ 錯誤訊息說明這是 re-index event 並指向補救方式,不只說「檢索失敗」,不洩漏 scopeKey", async () => {
    const store = makeStore();
    await store.upsert([record("doc-1#0", [1, 0], IDENTITY_A)]);

    let thrown: unknown;
    try {
      await store.query(QUERY, SCOPE, 10, IDENTITY_B);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(EmbeddingVersionMismatchError);
    const message = (thrown as Error).message;
    expect(message).toContain("re-index");
    expect(message).not.toBe("檢索失敗");
    // Security AC — must not leak the caller's own scope-key text either.
    expect(message).not.toContain("dept:eng");
  });
});

describe("EmbeddingVersionMismatchError — same-dimensions, different-model drift (the story's motivating scenario)", () => {
  it("兩個 provider 維度相同、model 不同 → 即使維度檢查會放行,身分檢查仍必須擋下", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert([record("doc-1#0", [1, 0], { model: "old-model", dimensions: 4 })]);

    await expect(
      store.query(
        Float32Array.from([1, 0, 0, 0]),
        SCOPE,
        10,
        { model: "new-model", dimensions: 4 }, // same dimensions as indexed data
      ),
    ).rejects.toBeInstanceOf(EmbeddingVersionMismatchError);
  });
});

describe("sqlite-vec — pre-story schema migration (AC5's literal scenario: data written before embedding_model/embedding_dimensions existed)", () => {
  it("既有 5 欄 _meta(無 embedding_model/embedding_dimensions)重新開啟後自動補欄,舊資料視為未知並在比對時被拒", async () => {
    const file = path.join(dir, "legacy-schema.sqlite");
    const db = openDb(file);

    // Build the table EXACTLY as `SQLITE_VEC_MIGRATION` did before this
    // story (5 meta columns, no identity) — this is what a real pre-E06-S026
    // on-disk database looks like.
    db.exec(
      `CREATE TABLE rag_chunks_meta (
         chunk_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, text TEXT NOT NULL,
         start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL);
       CREATE VIRTUAL TABLE rag_chunks_vec USING vec0(
         chunk_id TEXT PRIMARY KEY, scope_key TEXT PARTITION KEY, embedding FLOAT[${DIM}]);`,
    );
    db.prepare(`INSERT INTO rag_chunks_meta VALUES (?, ?, ?, ?, ?)`).run(
      "legacy#0",
      "legacy",
      "舊資料,寫入時這個 story 還不存在",
      0,
      10,
    );
    db.prepare(`INSERT INTO rag_chunks_vec (chunk_id, scope_key, embedding) VALUES (?, ?, ?)`).run(
      "legacy#0",
      "dept:eng",
      Buffer.from(Float32Array.from([1, 0]).buffer),
    );

    const columnsBefore = db.prepare(`PRAGMA table_info(rag_chunks_meta)`).all() as Array<{
      name: string;
    }>;
    expect(columnsBefore.map((c) => c.name)).not.toContain("embedding_model");

    // Opening the store against this EXISTING file must not crash, and must
    // add the missing columns (`CREATE TABLE IF NOT EXISTS` alone cannot —
    // see `migrateEmbeddingIdentityColumns`'s doc comment).
    const store = createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM });

    const columnsAfter = db.prepare(`PRAGMA table_info(rag_chunks_meta)`).all() as Array<{
      name: string;
    }>;
    expect(columnsAfter.map((c) => c.name)).toEqual(
      expect.arrayContaining(["embedding_model", "embedding_dimensions"]),
    );

    // Backward-compatible read (no expectedIdentity) still works.
    const hits = await store.query(QUERY, SCOPE, 10);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.embeddingModel).toBeUndefined();

    // But a caller that DOES ask for identity comparison gets refused —
    // AC5's literal words: "既有(migration 前)無身分欄位的資料,Then 檢索
    // 被拒絕,而非被當成相容".
    await expect(
      store.query(QUERY, SCOPE, 10, { model: "provider-a", dimensions: DIM }),
    ).rejects.toBeInstanceOf(EmbeddingVersionMismatchError);
  });

  it("migrateEmbeddingIdentityColumns 對已經是新 schema 的表是 no-op(不重複 ALTER、不拋錯)", () => {
    const db = openDb(path.join(dir, "already-current.sqlite"));
    createSqliteVecVectorStore({ db: db as unknown as SqliteDatabase, dimensions: DIM, tableName: "idempotent" });
    // Calling it again directly must not throw "duplicate column name".
    expect(() => migrateEmbeddingIdentityColumns(db as unknown as SqliteDatabase, "idempotent")).not.toThrow();
  });
});

describe("RetrievalService — enforceEmbeddingVersion opt-in (the composition-root wiring plugin.ts's default now uses)", () => {
  it("AC3/AC5 在 RetrievalService.retrieve() 這一層也成立:relevant provider 換了 → retrieve() 拒絕,而不是排出錯誤結果", async () => {
    const store = createInMemoryVectorStore();
    const indexingProvider = fakeEmbeddingProvider(IDENTITY_A, [1, 0]);
    await store.upsert([
      {
        chunkId: "doc-1#0",
        documentId: "doc-1",
        text: "維護紀錄:軸承過熱處理",
        startOffset: 0,
        endOffset: 10,
        scopeKey: "dept:eng",
        embedding: Float32Array.from([1, 0]),
        embeddingModel: IDENTITY_A.model,
        embeddingDimensions: IDENTITY_A.dimensions,
      },
    ]);

    // Same identity both sides, enforcement ON → succeeds normally.
    const sameProviderService = createRetrievalService({
      store,
      embedding: indexingProvider,
      enforceEmbeddingVersion: true,
    });
    const okHits = await sameProviderService.retrieve("軸承過熱", SCOPE, 5);
    expect(okHits.length).toBeGreaterThan(0);

    // A DIFFERENT provider (same dimensions, different model) queries the
    // SAME already-indexed store, enforcement ON → must refuse, not rank.
    const driftedProviderService = createRetrievalService({
      store,
      embedding: fakeEmbeddingProvider(IDENTITY_B, [1, 0]),
      enforceEmbeddingVersion: true,
    });
    await expect(driftedProviderService.retrieve("軸承過熱", SCOPE, 5)).rejects.toBeInstanceOf(
      EmbeddingVersionMismatchError,
    );

    // With enforcement OFF (the default — see `RetrievalServiceOptions`'s
    // doc comment), the SAME drifted provider silently ranks instead —
    // this is the exact gap this story closes, pinned here so a future
    // regression that makes the default silently swallow the mismatch (e.g.
    // by wiring `enforceEmbeddingVersion` backwards) cannot pass unnoticed.
    const driftedNoEnforce = createRetrievalService({ store, embedding: fakeEmbeddingProvider(IDENTITY_B, [1, 0]) });
    const unsafeHits = await driftedNoEnforce.retrieve("軸承過熱", SCOPE, 5);
    expect(unsafeHits.length).toBeGreaterThan(0);
  });
});
