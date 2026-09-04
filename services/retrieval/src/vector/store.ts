/**
 * VectorStore — real vector search, at two levels of persistence.
 *
 * NOTE ON "REAL": the in-memory store does exact brute-force KNN. That is not
 * an approximation of vector search — it is vector search, computed exactly,
 * without an index. sqlite-vec adds persistence and scale, not correctness.
 * So retrieval ordering asserted at PF1 stays true at PF2; what PF2 adds is
 * proof that serialisation, migrations and the on-disk path work.
 *
 * THE SCOPE PREDICATE IS A PARAMETER, NOT A POST-FILTER. `query` takes the
 * predicate and applies it while scanning candidates, so unauthorised rows
 * never reach the ranking step. 鐵律 #2 says "Authorization 先於 retrieval";
 * a store whose signature made the predicate optional would make violating
 * that the path of least resistance.
 */

// E04-S066 relocated evidence-tier.ts and embedding/provider.ts into this
// package (both were leaves — no outbound edges of their own — so the move
// added no new dependency). These are now ordinary in-package imports.
import type { FidelityRatedComponent } from "../evidence-tier.js";
import { dot, type Embedding } from "../embedding/provider.js";
import {
  assertNoScopeLeak,
  buildScopePredicate,
  type RetrievalScope,
  type ScopedRecord,
} from "../authorization/scope.js";

export interface VectorRecord extends ScopedRecord {
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly scopeKey: string;
  readonly embedding: Embedding;
  /**
   * E06-S026 — identity of the embedding function that produced `embedding`:
   * the provider's `model` string and the `dimensions` it declared for this
   * vector. This is what makes a stored vector comparable to a freshly
   * computed query vector; without it, a provider swap (or a version/model
   * change with the same provider) is indistinguishable from normal drift —
   * see `EmbeddingVersionMismatchError`'s doc comment below.
   *
   * OPTIONAL ON THE TYPE — deliberately. This package's own tests
   * (`store.test.ts`, `../service.test.ts`, `../plugin.test.ts`,
   * `../rerank/retrieve-with-reranking.test.ts`, and
   * `tests/sqlite-vec-store.integration.test.ts`) predate this concept and
   * build `VectorRecord`s directly without it; per `.claude/rules/
   * STORY_WORKFLOW.md` those tests' content is frozen and this story adds
   * fields, it does not touch them. Making these fields REQUIRED would force
   * edits to every one of those fixtures to keep compiling.
   *
   * The real write path (`services/ingestion`'s `createIngestionService`)
   * always supplies both, and refuses to write when the Model Gateway does
   * not report them (`IngestionEmbeddingIdentityError`) — see that package's
   * `service.ts`. So "missing" only ever means "written before E06-S026, or
   * written directly against this store's low-level API rather than through
   * the ingestion pipeline" — both cases `query()`'s optional
   * `expectedIdentity` parameter treats as UNKNOWN and refuses (AC5), never
   * as compatible.
   */
  readonly embeddingModel?: string;
  readonly embeddingDimensions?: number;
}

/**
 * E06-S026 — the embedding identity a query is computed with: the
 * `EmbeddingProvider`'s `model` and `dimensions` at query time. Passed as
 * `VectorStore.query()`'s optional 4th argument so the store can refuse to
 * rank against vectors it knows were produced by a different function.
 */
export interface EmbeddingIdentity {
  readonly model: string;
  readonly dimensions: number;
}

export interface RetrievalHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly scopeKey: string;
  readonly score: number;
  /**
   * The chunk's own vector, when the `VectorStore` that produced this hit can
   * supply it. OPTIONAL — added for `rerank/mmr.ts` (E04-S016), which needs
   * document-document similarity for its redundancy term and reuses these
   * vectors rather than calling an embedding provider a second time.
   *
   * Optional (not required) on purpose: a `VectorStore` that only ever
   * returns pure-relevance results (or a test double, like `service.test.
   * ts`'s leaky-store fixture and `rag-skeleton`'s equivalent) is still a
   * fully valid `RetrievalHit` producer. `rerankMmr` at `lambda = 1` does not
   * need this field at all; at `lambda < 1` it fails loudly (`RerankError`)
   * rather than silently treating a missing vector as "not redundant" — see
   * `rerank/mmr.ts`'s `requireEmbedding`.
   *
   * `createInMemoryVectorStore` populates this (the vector is already in
   * memory as part of the `VectorRecord` it scored). `createSqliteVecVector
   * Store` (PF2) populates it too (E04-S067) — reading the vec0 blob back out
   * on the query path, mirroring the `Buffer.from` already done on the insert
   * side, so MMR at λ<1 works against the persistent store and not only the
   * in-memory one (see this package's `rerank/mmr.ts` and the E04-S016 /
   * E04-S067 evidence files for why this was deferred and then closed).
   */
  readonly embedding?: Embedding;

  /**
   * E06-S026 — the stored chunk's own embedding identity, when the
   * `VectorStore` that produced this hit can supply it (mirrors
   * `embedding?`'s reasoning above: optional so a store/test double with no
   * knowledge of this concept is still a valid `RetrievalHit` producer).
   * Exposed mainly so a caller (or a test) can verify what was actually
   * persisted without a second, store-specific query.
   */
  readonly embeddingModel?: string;
  readonly embeddingDimensions?: number;
}

export interface VectorStore extends FidelityRatedComponent {
  upsert(records: readonly VectorRecord[]): Promise<void>;
  /**
   * Scope is REQUIRED. There is deliberately no unscoped query method.
   *
   * `expectedIdentity` (E06-S026) is OPTIONAL and OFF by default precisely so
   * this signature change does not retroactively change the behaviour of any
   * existing call site — see `EmbeddingIdentity`'s doc comment and
   * `RetrievalServiceOptions.enforceEmbeddingVersion` in `../service.ts` for
   * why. When supplied, an implementation MUST compare it against the
   * identity recorded on every candidate row THIS query would otherwise
   * consider (within the caller's authorised scope) and throw
   * `EmbeddingVersionMismatchError` — refusing to return ANY hits — the
   * moment one disagrees or is missing, BEFORE doing any similarity ranking.
   */
  query(
    embedding: Embedding,
    scope: RetrievalScope,
    limit: number,
    expectedIdentity?: EmbeddingIdentity,
  ): Promise<readonly RetrievalHit[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}

/**
 * E06-S026 — thrown by `VectorStore.query()` when an `expectedIdentity` was
 * supplied and at least one candidate row's recorded embedding identity
 * either disagrees with it, or is missing entirely (fail-closed: missing
 * identity means "written before this feature existed, or via a path that
 * skipped it", never "assume compatible" — Scope In's explicit migration
 * rule). Its own named class (not a subtype of `VectorStoreError` — that
 * class's `name` is a narrowed string-literal type a subclass cannot
 * override with a different literal — nor of `EmbeddingError`, since the
 * vectors involved are perfectly well-formed; the problem is that they were
 * never comparable to begin with, not a computation error).
 */
export class EmbeddingVersionMismatchError extends Error {
  override readonly name = "EmbeddingVersionMismatchError";
}

/**
 * Shared by both stores (mirrors `checkDocumentScopeConsistency`'s pattern)
 * so the refusal condition and message cannot drift between the in-memory
 * and sqlite-vec implementations.
 *
 * Deliberately does NOT name a chunkId, documentId, or scopeKey in the
 * message — this runs on the query path, and the Security Acceptance
 * Criterion for this story forbids an error message leaking document
 * content, chunk text, or a scope-key listing. Model/dimensions identifiers
 * are configuration facts (which embedding function is deployed), not
 * tenant data, so stating them is what AC3/AC6 require ("錯誤訊息同時指出
 * 索引身分與查詢身分" / "必須說明這是 re-index event").
 */
export function assertEmbeddingIdentityMatches(
  indexed: { readonly embeddingModel?: string; readonly embeddingDimensions?: number } | undefined,
  expected: EmbeddingIdentity,
): void {
  const indexedModel = indexed?.embeddingModel;
  const indexedDimensions = indexed?.embeddingDimensions;
  const REINDEX_GUIDANCE =
    "這是一次 re-index event:embedding 的產生方式已經改變(或從未記錄過),舊索引與新查詢不再" +
    "可比。請重新索引受影響的內容(重新呼叫 ingestion 的 ingest()),而不是忽略這個錯誤或放行——" +
    "見 embedding/provider.ts 與 contracts/openapi/embedding.yaml 對 re-index event 的定義。";

  if (
    typeof indexedModel !== "string" ||
    indexedModel.trim() === "" ||
    typeof indexedDimensions !== "number" ||
    !Number.isFinite(indexedDimensions)
  ) {
    throw new EmbeddingVersionMismatchError(
      `索引中存在沒有記錄 embedding 身分(model/dimensions)的資料,視為未知,拒絕檢索——不得猜測` +
        `為「大概是現在這個 provider」。${REINDEX_GUIDANCE}`,
    );
  }
  if (indexedModel !== expected.model || indexedDimensions !== expected.dimensions) {
    throw new EmbeddingVersionMismatchError(
      `查詢向量的 embedding 身分(model=${expected.model}, dimensions=${expected.dimensions})與` +
        `索引中既有向量的身分(model=${indexedModel}, dimensions=${indexedDimensions})不符,拒絕` +
        `檢索——不得回傳任何結果,即使維度相同。${REINDEX_GUIDANCE}`,
    );
  }
}

export class VectorStoreError extends Error {
  override readonly name = "VectorStoreError";
}

/**
 * E06-S043 — thrown when a re-ingest of an already-stored `documentId`
 * arrives under a DIFFERENT `scopeKey` than the one it was originally stored
 * with.
 *
 * WHY THIS EXISTS: `chunkId` is `${documentId}#${ordinal}` (E06-S022) with no
 * scope dimension, and both stores upsert keyed by `chunkId`. Before this
 * guard, re-ingesting `doc-1` under `dept:maintenance` after it had been
 * ingested under `dept:finance` silently gave maintenance a document it was
 * never authorised for AND silently removed it from finance — two
 * authorization failures, zero errors, measured directly against both
 * stores on 2026-09-02 (see `archive/stories/specs/E06-S043.spec.md`).
 *
 * "Move a document from department A to B" MAY be a legitimate product
 * operation, but that is a decision for the user, not this store — see the
 * spec's Scope Out. Until that is decided, changing a document's scope via
 * re-ingest is refused unconditionally, fail-closed.
 *
 * SECURITY: the message deliberately does NOT state what the document's
 * current `scopeKey` actually is — which department a document belongs to is
 * itself authorization information, and the caller attempting the conflicting
 * re-ingest may not be authorised to learn it.
 */
export class DocumentScopeConflictError extends Error {
  override readonly name = "DocumentScopeConflictError";
  /**
   * Stable, machine-checkable identity for this failure — callers should
   * match on `code`, not on parsing `message` (which stays human-readable /
   * Chinese, and may be reworded).
   */
  readonly code = "DOCUMENT_SCOPE_CONFLICT" as const;
}

/**
 * Human-readable explanation shared by both stores so the two error messages
 * (in-memory / sqlite-vec) read identically — AC5 requires the BEHAVIOUR to
 * match; keeping the wording identical too makes that easy to verify by eye.
 * Deliberately does not name the document's actual current scopeKey (see
 * `DocumentScopeConflictError`'s doc comment) and deliberately explains the
 * refusal rather than just saying "ingest failed" (Functional AC6).
 */
export const DOCUMENT_SCOPE_CONFLICT_MESSAGE =
  "重新匯入被拒:這個 documentId 先前已用不同的 scopeKey 匯入過,重新匯入不能改變一份文件的" +
  "可見範圍(拒絕時不揭露目前實際的 scopeKey,因為那本身是一則授權資訊)。若這是要把文件從一個" +
  "部門移到另一個部門,那必須是獨立、有稽核紀錄的顯式操作——目前尚未開放,不能是重新匯入的副作用。" +
  "請改用文件原本的 scopeKey 重新匯入,或聯絡管理者處理跨部門搬移。";

/**
 * Groups records by `documentId`, preserving each group's insertion order.
 * Shared by both stores so "how upsert batches are partitioned per document"
 * cannot drift between them (AC5).
 */
export function groupRecordsByDocumentId(
  records: readonly VectorRecord[],
): ReadonlyMap<string, VectorRecord[]> {
  const byDoc = new Map<string, VectorRecord[]>();
  for (const record of records) {
    const bucket = byDoc.get(record.documentId);
    if (bucket) bucket.push(record);
    else byDoc.set(record.documentId, [record]);
  }
  return byDoc;
}

/**
 * Phase-1 validation shared by both stores: given one document's batch of
 * incoming records and the SET of scopeKeys that document already has in the
 * store (empty = not yet stored), decide whether this upsert must be refused.
 *
 * Two ways a conflict can arise:
 *  - the incoming batch itself mixes more than one scopeKey for the same
 *    documentId (an internally inconsistent caller);
 *  - the incoming scopeKey differs from what is already stored for that
 *    documentId.
 *
 * Pure and synchronous on purpose — callers run this BEFORE mutating
 * anything, so a conflict on document 5 of a 10-document batch writes
 * nothing for any of the 10 (Functional AC1/AC2, AC4).
 */
export function checkDocumentScopeConsistency(
  documentId: string,
  docRecords: readonly VectorRecord[],
  existingScopeKeys: ReadonlySet<string>,
): void {
  const incomingScopeKeys = new Set(docRecords.map((r) => r.scopeKey));
  if (incomingScopeKeys.size > 1) {
    throw new DocumentScopeConflictError(
      `documentId "${documentId}" 在同一次 upsert 呼叫中帶有超過一個 scopeKey。${DOCUMENT_SCOPE_CONFLICT_MESSAGE}`,
    );
  }
  const [incomingScopeKey] = incomingScopeKeys;
  for (const existingScopeKey of existingScopeKeys) {
    if (existingScopeKey !== incomingScopeKey) {
      throw new DocumentScopeConflictError(
        `documentId "${documentId}" ${DOCUMENT_SCOPE_CONFLICT_MESSAGE}`,
      );
    }
  }
}

/**
 * In-memory exact KNN. Ceiling PF1 — the arithmetic is exact, but nothing is
 * persisted, so it cannot speak to migrations, restarts or on-disk formats.
 */
export function createInMemoryVectorStore(): VectorStore {
  const rows = new Map<string, VectorRecord>();

  return {
    componentId: "vector-store:in-memory",
    fidelityCeiling: "PF1",

    async upsert(records) {
      // ── Phase 1: validate EVERYTHING before writing ANYTHING (E06-S043) ──
      // A guard that fires after some rows are already written is not a
      // guard — it is a partial write with an error message attached. This
      // whole method body is synchronous (no `await` anywhere below), so once
      // Phase 1 passes, Phase 2 cannot be interleaved with any other call —
      // that is what makes the replacement atomic on this store.
      for (const record of records) {
        if (typeof record.scopeKey !== "string" || record.scopeKey.trim() === "") {
          throw new VectorStoreError(
            `chunk ${record.chunkId} 缺少 scopeKey。沒有範圍的資料無法被授權過濾,` +
              `寫入時就必須擋下,否則它會對所有人可見。`,
          );
        }
      }

      const byDoc = groupRecordsByDocumentId(records);
      for (const [documentId, docRecords] of byDoc) {
        const existingScopeKeys = new Set<string>();
        for (const existing of rows.values()) {
          if (existing.documentId === documentId) existingScopeKeys.add(existing.scopeKey);
        }
        checkDocumentScopeConsistency(documentId, docRecords, existingScopeKeys);
      }

      // ── Phase 2: apply. Same scopeKey ⇒ atomic replacement — delete every
      // existing chunk of this document NOT present in the new set, so a
      // document that now produces FEWER chunks does not leave surplus old
      // chunks in the store pointing citations at passages that no longer
      // exist (E06-S043 AC3). ──
      for (const [documentId, docRecords] of byDoc) {
        const keep = new Set(docRecords.map((r) => r.chunkId));
        for (const [chunkId, existing] of rows) {
          if (existing.documentId === documentId && !keep.has(chunkId)) {
            rows.delete(chunkId);
          }
        }
        for (const record of docRecords) {
          rows.set(record.chunkId, record);
        }
      }
    },

    async query(embedding, scope, limit, expectedIdentity) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new VectorStoreError("limit 必須是正整數。");
      }
      const allowed = buildScopePredicate(scope);

      // E06-S026 — BEFORE any scoring: every authorised candidate's recorded
      // embedding identity must match `expectedIdentity`, or this call throws
      // and returns NOTHING (not a partial/filtered result — see
      // `assertEmbeddingIdentityMatches`'s doc comment). Only runs at all when
      // a caller opted in by supplying `expectedIdentity` — see
      // `EmbeddingIdentity`'s doc comment for why this is not unconditional.
      if (expectedIdentity) {
        for (const record of rows.values()) {
          if (!allowed(record)) continue;
          assertEmbeddingIdentityMatches(record, expectedIdentity);
        }
      }

      const scored: RetrievalHit[] = [];
      for (const record of rows.values()) {
        // Pre-filter: unauthorised rows are skipped before scoring.
        if (!allowed(record)) continue;
        scored.push({
          chunkId: record.chunkId,
          documentId: record.documentId,
          text: record.text,
          startOffset: record.startOffset,
          endOffset: record.endOffset,
          scopeKey: record.scopeKey,
          score: dot(embedding, record.embedding),
          // Already held in memory as part of `record` — no extra work to
          // carry it onto the hit. See `RetrievalHit.embedding`'s docstring.
          embedding: record.embedding,
          // `exactOptionalPropertyTypes` is on for this package (see
          // `sqlite-vec.store.ts`'s identical pattern for `embedding`) — an
          // explicit `embeddingModel: undefined` is a type error distinct
          // from the key being absent, hence the conditional spread.
          ...(record.embeddingModel !== undefined ? { embeddingModel: record.embeddingModel } : {}),
          ...(record.embeddingDimensions !== undefined
            ? { embeddingDimensions: record.embeddingDimensions }
            : {}),
        });
      }

      scored.sort((a, b) => (b.score - a.score) || a.chunkId.localeCompare(b.chunkId));
      const top = scored.slice(0, limit);

      // Defence in depth — see authorization/scope.ts.
      assertNoScopeLeak(scope, top);
      return top;
    },

    async count() {
      return rows.size;
    },

    async close() {
      rows.clear();
    },
  };
}
