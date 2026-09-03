/**
 * SqliteVecVectorStore — ceiling PF2.
 *
 * Persistence for the same semantics the in-memory store already provides, so
 * ordering assertions written at PF1 hold here unchanged. What this adds is the
 * seam PF1 cannot reach: real SQL, real serialisation of Float32 buffers, a
 * real migration, and a real file that survives a restart.
 *
 * WHY sqlite-vec RATHER THAN A VECTOR DATABASE
 *
 * The repo already runs SQLite — `infra/docker/docker-compose.yml` sets
 * `AI_KM_DB_PATH=/data/ai-km.sqlite`, and `better-sqlite3` is already a
 * dependency of every service. sqlite-vec is a loadable extension written in
 * C with no dependencies, so RAG storage costs one `.load` rather than another
 * container, another port, another thing to keep alive on a machine whose load
 * average is already documented at 27.
 *
 * DISTRIBUTION: upstream `asg017/sqlite-vec`, pinned to EXACTLY 0.1.9 (user
 * decision 2026-09-02). Not `^0.1.9`: the extension defines how a persisted
 * index is read, so moving it is a re-index event, not a patch bump. The
 * 0.1.10-alpha line was deliberately not taken. The community fork
 * (vlasky/sqlite-vec) is more actively maintained but publishes no npm package
 * and no releases; `@sqliteai/sqlite-vector` has an entirely different SQL API.
 * This file isolates that choice to one place on purpose.
 *
 * ── AUTHORIZATION RUNS INSIDE THE KNN SEARCH ────────────────────────────────
 *
 * `scope_key` is a vec0 PARTITION KEY, so sqlite-vec restricts the search to
 * the principal's shards before scoring. That is what 鐵律 #2's "authorization
 * 先於 retrieval" actually requires: unauthorised vectors are never scored, not
 * scored-then-dropped.
 *
 * THE PREVIOUS SHAPE WAS BROKEN, and not in the way it looks. It kept
 * `scope_key` in the side table and filtered with a JOIN after the KNN:
 *
 *     FROM vec v JOIN meta m ON m.chunk_id = v.chunk_id
 *     WHERE v.embedding MATCH ? AND k = ? AND m.scope_key IN (...)
 *
 * vec0 computes the global top-k FIRST; the JOIN then removes whatever the
 * principal may not read. No data leaks — and the caller gets **fewer than k
 * rows, frequently zero**. Measured on 2026-09-02 with three finance chunks
 * nearer the query than any maintenance chunk: a maintenance engineer
 * searching maintenance records got `[]`, while the records existed and they
 * were authorised for them. It reads as "no matching documents". Nothing
 * errors. `AC-V6` in the PF2 tests pins this so the shape cannot come back.
 *
 * ── WHY N QUERIES AND NOT ONE ───────────────────────────────────────────────
 *
 * A partition key honours `=` only. `IN (...)` and `OR` do NOT error — they
 * return k rows PER PARTITION, concatenated and NOT globally sorted. Measured
 * on 0.1.9 with k=4 over two authorised departments: 8 rows came back, and the
 * first four were the four WORST matches. A caller trusting `k` and slicing
 * would serve the least relevant results. So each authorised scope gets its
 * own `= ?` query and the merge happens here, in code a test can pin.
 *
 * This is exact, not approximate: every chunk carries exactly one `scope_key`,
 * so the partitions are disjoint, and anything in the authorised global top-k
 * ranks at least as high within its own partition. Merging per-partition
 * top-k and re-slicing therefore yields the true authorised top-k. The
 * disjointness that argument rests on is asserted at runtime below rather than
 * assumed — see `PartitionOverlapError`.
 *
 * (`buildScopeSql` is deliberately NOT used on this path. It builds `IN (...)`
 * / `1 = 0` for stores that filter in an ordinary table, which is right there
 * and wrong here. It stays exported and tested for those stores.)
 *
 * OVERSHARDING: sqlite-vec recommends ~hundreds of vectors per unique
 * partition key value. Department-level scope keys should reach that in a
 * populated deployment but will be sparse early on. That is a performance
 * characteristic, not a correctness one; revisit with a broader key
 * (organisation, knowledge base) if KNN latency becomes a problem.
 */

// Same relocation as vector/store.ts — see the comment at the top of that
// file. evidence-tier.ts and embedding/provider.ts now live in this package.
import type { FidelityRatedComponent } from "../evidence-tier.js";
import type { Embedding } from "../embedding/provider.js";
import { assertNoScopeLeak, type RetrievalScope } from "../authorization/scope.js";
import {
  VectorStoreError,
  groupRecordsByDocumentId,
  checkDocumentScopeConsistency,
  assertEmbeddingIdentityMatches,
  type EmbeddingIdentity,
  type RetrievalHit,
  type VectorRecord,
  type VectorStore,
} from "./store.js";

/**
 * Structural types for the bits of better-sqlite3 used here, so this file
 * typechecks in a workspace that has not installed it yet.
 */
export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}
export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): unknown;
  close(): unknown;
}

export interface SqliteVecStoreOptions {
  readonly db: SqliteDatabase;
  readonly dimensions: number;
  readonly tableName?: string;
}

/**
 * `scope_key` lives in the vec0 table as a partition key and NOWHERE ELSE.
 * A second copy in `_meta` would be a second answer to "may this principal
 * read this chunk", and the two would eventually disagree. The authorization
 * answer is the one the index was sharded by.
 */
export const SQLITE_VEC_MIGRATION = (tableName: string, dimensions: number): string => `
CREATE TABLE IF NOT EXISTS ${tableName}_meta (
  chunk_id             TEXT PRIMARY KEY,
  document_id          TEXT NOT NULL,
  text                 TEXT NOT NULL,
  start_offset         INTEGER NOT NULL,
  end_offset           INTEGER NOT NULL,
  embedding_model      TEXT,
  embedding_dimensions INTEGER
);
CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName}_vec USING vec0(
  chunk_id TEXT PRIMARY KEY,
  scope_key TEXT PARTITION KEY,
  embedding FLOAT[${dimensions}]
);
`;

/**
 * E06-S026 — additive backward-compat migration for a `_meta` table created
 * by CODE OLDER THAN THIS STORY, before `embedding_model`/`embedding_
 * dimensions` existed.
 *
 * WHY THIS IS SEPARATE FROM `SQLITE_VEC_MIGRATION`: `CREATE TABLE IF NOT
 * EXISTS` is a no-op against a table that already exists — it does NOT add
 * columns to it. A `.sqlite` file written before this story landed would
 * therefore silently keep its old 5-column shape forever unless something
 * else runs `ALTER TABLE ... ADD COLUMN` against it. This function is that
 * something, called unconditionally on every store construction, immediately
 * after `SQLITE_VEC_MIGRATION` — cheap (one `PRAGMA table_info` read) and
 * idempotent (checks before adding), so it costs nothing on a table that is
 * already current.
 *
 * NOT a destructive migration and not a data backfill: existing rows get
 * `NULL` for both new columns, which `assertEmbeddingIdentityMatches` treats
 * as UNKNOWN and refuses at query time (AC5) — this function's only job is
 * to make that column exist to be NULL, not to guess a value for it.
 */
export function migrateEmbeddingIdentityColumns(db: SqliteDatabase, tableName: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName}_meta)`).all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("embedding_model")) {
    db.exec(`ALTER TABLE ${tableName}_meta ADD COLUMN embedding_model TEXT`);
  }
  if (!names.has("embedding_dimensions")) {
    db.exec(`ALTER TABLE ${tableName}_meta ADD COLUMN embedding_dimensions INTEGER`);
  }
}

/**
 * Thrown when one chunk comes back from more than one partition query.
 *
 * The merge above is only exact because partitions are disjoint. That is an
 * assumption about how vec0 shards, and an assumption nothing checks is a
 * comment. Deduplicating quietly would paper over a broken index and, worse,
 * would mean a chunk could be reachable through a scope it does not belong to.
 */
export class PartitionOverlapError extends Error {
  override readonly name = "PartitionOverlapError";
}

/**
 * Caller loads the extension (`sqliteVec.load(db)`) and passes the db in, so
 * this module never reaches for a package that may not be installed and the
 * extension-loading policy stays with whoever owns the connection.
 */
export function createSqliteVecVectorStore(options: SqliteVecStoreOptions): VectorStore {
  const { db, dimensions } = options;
  const table = options.tableName ?? "rag_chunks";

  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new VectorStoreError(`tableName ${JSON.stringify(table)} 不是合法識別字。`);
  }

  db.exec(SQLITE_VEC_MIGRATION(table, dimensions));
  // E06-S026 — backward-compat: a `_meta` table created by pre-story code has
  // no `embedding_model`/`embedding_dimensions` columns, and `CREATE TABLE IF
  // NOT EXISTS` above is a no-op against it. See this function's doc comment.
  migrateEmbeddingIdentityColumns(db, table);

  const insertMeta = db.prepare(
    `INSERT INTO ${table}_meta (chunk_id, document_id, text, start_offset, end_offset, embedding_model, embedding_dimensions)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chunk_id) DO UPDATE SET
       document_id = excluded.document_id,
       text = excluded.text,
       start_offset = excluded.start_offset,
       end_offset = excluded.end_offset,
       embedding_model = excluded.embedding_model,
       embedding_dimensions = excluded.embedding_dimensions`,
  );
  const deleteVec = db.prepare(`DELETE FROM ${table}_vec WHERE chunk_id = ?`);
  const insertVec = db.prepare(
    `INSERT INTO ${table}_vec (chunk_id, scope_key, embedding) VALUES (?, ?, ?)`,
  );
  // E06-S043: deleting the META row too (not just the vec0 row) is what makes
  // a shrinking re-ingest's surplus chunks actually gone rather than an
  // orphaned meta row `count()` would still tally and a future chunk_id reuse
  // could resurrect.
  const deleteMeta = db.prepare(`DELETE FROM ${table}_meta WHERE chunk_id = ?`);
  // Phase-1 lookups for the E06-S043 scope guard — read-only, so they are safe
  // to run before any transaction opens. `scope_key` lives ONLY on the vec0
  // side (see the migration's doc comment above), hence the join.
  const existingScopeKeysForDoc = db.prepare(
    `SELECT DISTINCT v.scope_key AS scopeKey
       FROM ${table}_meta m
       JOIN ${table}_vec v ON v.chunk_id = m.chunk_id
      WHERE m.document_id = ?`,
  );
  const existingChunkIdsForDoc = db.prepare(
    `SELECT chunk_id AS chunkId FROM ${table}_meta WHERE document_id = ?`,
  );
  // E06-S026 — read-only, run BEFORE any KNN for a given scope. Every chunk
  // meta row currently sitting in this scope's partition, so `query()` can
  // refuse the WHOLE call the moment one disagrees with `expectedIdentity` —
  // without this running first, a mismatch could only be caught per-row
  // AFTER the KNN had already picked a top-k and this store would have to
  // choose between returning a filtered (silently smaller) result or
  // discovering the mismatch too late to un-return rows.
  const identitiesForScope = db.prepare(
    `SELECT DISTINCT m.embedding_model AS embeddingModel, m.embedding_dimensions AS embeddingDimensions
       FROM ${table}_vec v
       JOIN ${table}_meta m ON m.chunk_id = v.chunk_id
      WHERE v.scope_key = ?`,
  );

  /**
   * ONE authorised scope per execution. `scope_key = ?` is the only operator a
   * vec0 partition key honours, and it is the constraint sqlite-vec pushes
   * into the KNN search itself.
   *
   * The JOIN carries NO authorization predicate — it is an inner join on the
   * primary key that exists only to fetch the text and offsets. Every filtering
   * decision has already been made inside the vec0 `WHERE` by the time the join
   * runs. If a predicate on `m.` ever appears here, the fix from 2026-09-02 has
   * been undone; `AC-V6` will catch it.
   */
  const knnByScope = db.prepare(
    `SELECT v.chunk_id             AS chunkId,
            v.scope_key            AS scopeKey,
            v.distance             AS distance,
            v.embedding            AS embedding,
            m.document_id          AS documentId,
            m.text                 AS text,
            m.start_offset         AS startOffset,
            m.end_offset           AS endOffset,
            m.embedding_model      AS embeddingModel,
            m.embedding_dimensions AS embeddingDimensions
       FROM ${table}_vec v
       JOIN ${table}_meta m ON m.chunk_id = v.chunk_id
      WHERE v.embedding MATCH ?
        AND k = ?
        AND v.scope_key = ?`,
  );

  const store: VectorStore & FidelityRatedComponent = {
    componentId: "vector-store:sqlite-vec",
    fidelityCeiling: "PF2",

    async upsert(records: readonly VectorRecord[]) {
      // ── Phase 1: validate EVERYTHING before writing ANYTHING (E06-S043) ──
      // All of this runs BEFORE `BEGIN` — nothing below has mutated the
      // database yet, so throwing here writes literally nothing (Functional
      // AC1/AC2).
      for (const record of records) {
        if (typeof record.scopeKey !== "string" || record.scopeKey.trim() === "") {
          throw new VectorStoreError(
            `chunk ${record.chunkId} 缺少 scopeKey,寫入被拒。沒有範圍的資料無法被授權過濾。`,
          );
        }
        if (record.embedding.length !== dimensions) {
          throw new VectorStoreError(
            `chunk ${record.chunkId} 的向量維度 ${record.embedding.length} 與資料表宣告的 ${dimensions} 不符。`,
          );
        }
      }

      const byDoc = groupRecordsByDocumentId(records);
      for (const [documentId, docRecords] of byDoc) {
        const existingRows = existingScopeKeysForDoc.all(documentId) as Array<{ scopeKey: string }>;
        const existingScopeKeys = new Set(existingRows.map((r) => r.scopeKey));
        checkDocumentScopeConsistency(documentId, docRecords, existingScopeKeys);
      }

      // ── Phase 2: apply atomically. A real transaction — not just "no await
      // between steps" like the in-memory store can rely on — because this is
      // real I/O and a later statement CAN fail (a driver error, a corrupt
      // page, a future check added to this loop). On failure the transaction
      // rolls back, so old and new chunks are never left mixed (AC4). ──
      db.exec("BEGIN");
      try {
        for (const [documentId, docRecords] of byDoc) {
          // Same scopeKey ⇒ atomic replacement: delete every existing chunk
          // of this document NOT present in the new set, so a document that
          // now produces FEWER chunks does not leave surplus old chunks in
          // the store pointing citations at passages that no longer exist
          // (AC3).
          const keep = new Set(docRecords.map((r) => r.chunkId));
          const existingIds = existingChunkIdsForDoc.all(documentId) as Array<{ chunkId: string }>;
          for (const { chunkId } of existingIds) {
            if (!keep.has(chunkId)) {
              deleteVec.run(chunkId);
              deleteMeta.run(chunkId);
            }
          }

          for (const record of docRecords) {
            insertMeta.run(
              record.chunkId,
              record.documentId,
              record.text,
              record.startOffset,
              record.endOffset,
              // E06-S026 — `?? null`, not a default: absence here means "this
              // caller did not supply an identity" (e.g. these tests,
              // predating this concept — see `VectorRecord.embeddingModel`'s
              // doc comment), and `NULL` is exactly what `query()`'s
              // `expectedIdentity` check treats as UNKNOWN, not "assume
              // compatible". The real write path (`services/ingestion`)
              // always supplies both.
              record.embeddingModel ?? null,
              record.embeddingDimensions ?? null,
            );
            // vec0 virtual tables do not support UPSERT; delete-then-insert is
            // the documented pattern for replacing a row. It also moves the
            // chunk to a new shard when its scope_key changes, which an
            // UPDATE could not — irrelevant here since scope conflicts are
            // already refused above, but the mechanism still applies to a
            // same-scope re-ingest of an unchanged chunk.
            deleteVec.run(record.chunkId);
            insertVec.run(
              record.chunkId,
              record.scopeKey,
              Buffer.from(record.embedding.buffer.slice(0)),
            );
          }
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    async query(
      embedding: Embedding,
      scope: RetrievalScope,
      limit: number,
      expectedIdentity?: EmbeddingIdentity,
    ) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new VectorStoreError("limit 必須是正整數。");
      }

      // Deny-all short-circuits before any SQL runs. Not an optimisation: a
      // principal who may read nothing must not be expressible as a query at
      // all, so there is no statement for a later edit to widen.
      const scopeKeys = [...new Set(scope.allowedScopeKeys)];
      if (scopeKeys.length === 0) return [];

      // E06-S026 — BEFORE any KNN: every chunk currently sitting in each
      // authorised scope must agree with `expectedIdentity`, or this throws
      // and NO KNN runs for ANY scope — "reject before returning results",
      // not "filter out the bad ones and return what is left" (Scope In /
      // AC3's "不得回傳任何結果,即使維度相同"). Only runs when a caller
      // opted in — see `RetrievalServiceOptions.enforceEmbeddingVersion`.
      if (expectedIdentity) {
        for (const scopeKey of scopeKeys) {
          const identityRows = identitiesForScope.all(scopeKey) as Array<{
            embeddingModel: string | null;
            embeddingDimensions: number | null;
          }>;
          for (const row of identityRows) {
            assertEmbeddingIdentityMatches(
              {
                ...(row.embeddingModel !== null ? { embeddingModel: row.embeddingModel } : {}),
                ...(row.embeddingDimensions !== null
                  ? { embeddingDimensions: row.embeddingDimensions }
                  : {}),
              },
              expectedIdentity,
            );
          }
        }
      }

      // One `= ?` query per authorised scope. sqlite-vec restricts the KNN to
      // that shard, so nothing outside the principal's range is ever scored.
      const merged: RetrievalHit[] = [];
      const originPartition = new Map<string, string>();

      for (const scopeKey of scopeKeys) {
        const rows = knnByScope.all(
          Buffer.from(embedding.buffer.slice(0)),
          limit,
          scopeKey,
        ) as Array<Record<string, unknown>>;

        for (const r of rows) {
          const chunkId = String(r.chunkId);
          const previous = originPartition.get(chunkId);
          if (previous !== undefined) {
            throw new PartitionOverlapError(
              `chunk ${chunkId} 同時出現在 partition ${previous} 與 ${scopeKey} 的結果中。` +
                `vec0 的 partition 應該互斥(每個 chunk 只有一個 scope_key),此假設不成立代表` +
                `索引已損壞或 scope_key 寫入有誤。不在此處靜默去重——去重會讓一個 chunk ` +
                `經由它不屬於的範圍被讀到,那正是這一層要擋的事。`,
            );
          }
          originPartition.set(chunkId, scopeKey);

          // `v.embedding` comes back as a Buffer (Node's better-sqlite3 blob
          // type), the exact bytes `Buffer.from(record.embedding.buffer...)`
          // wrote on the insert side. Decode with the mirror-image view:
          // Float32Array over that same buffer, byteOffset/4 for length so a
          // sliced/pooled Buffer (Node may hand back a view into a shared
          // allocation) is not misread past its own bytes.
          //
          // Guarded rather than assumed present: if the SELECT above did not
          // ask for `v.embedding` (e.g. a future edit drops the column),
          // `r.embedding` is `undefined`, and this must leave `embedding`
          // unset on the hit rather than throw here — `RetrievalHit.
          // embedding` is optional precisely so `rerank/mmr.ts`'s
          // `requireEmbedding` is the thing that fails loudly (`RerankError`)
          // at λ<1, not an unrelated crash inside the store itself.
          const embeddingBuffer = r.embedding as Buffer | undefined;
          const embedding = embeddingBuffer
            ? new Float32Array(
                embeddingBuffer.buffer,
                embeddingBuffer.byteOffset,
                embeddingBuffer.byteLength / 4,
              )
            : undefined;

          merged.push({
            chunkId,
            documentId: String(r.documentId),
            text: String(r.text),
            startOffset: Number(r.startOffset),
            endOffset: Number(r.endOffset),
            scopeKey: String(r.scopeKey),
            // vec0 returns distance; smaller is closer. Convert so callers
            // compare scores the same way as the in-memory store.
            score: -Number(r.distance),
            // E04-S067 — read back so `rerank/mmr.ts` can run at λ<1 against
            // this store, not just the in-memory one. See `RetrievalHit.
            // embedding`'s docstring in store.ts for why this is optional on
            // the type and why a missing one fails loudly rather than
            // silently degrading. Spread rather than assigning `undefined`
            // directly: `RetrievalHit` is compiled under
            // `exactOptionalPropertyTypes`, which treats an explicit
            // `embedding: undefined` as a type error distinct from the key
            // being absent.
            ...(embedding ? { embedding } : {}),
            // E06-S026 — round-tripped so a caller/test can verify what was
            // actually persisted without a second, store-specific query.
            // `NULL` (pre-migration or identity-less rows) becomes absent on
            // the hit, same `exactOptionalPropertyTypes` reasoning as above.
            ...(r.embeddingModel !== null && r.embeddingModel !== undefined
              ? { embeddingModel: String(r.embeddingModel) }
              : {}),
            ...(r.embeddingDimensions !== null && r.embeddingDimensions !== undefined
              ? { embeddingDimensions: Number(r.embeddingDimensions) }
              : {}),
          });
        }
      }

      // Identical comparator to the in-memory store, ties included: without the
      // chunkId tiebreak the two stores could order equal-scoring chunks
      // differently, and an assertion written at PF1 would not hold at PF2.
      merged.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
      const top = merged.slice(0, limit);

      assertNoScopeLeak(scope, top);
      return top;
    },

    async count() {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}_meta`).get() as
        | { n: number }
        | undefined;
      return Number(row?.n ?? 0);
    },

    async close() {
      db.close();
    },
  };

  return store;
}
