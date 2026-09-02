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
   * Store` (PF2) does NOT yet — reading it back out of the `vec0` virtual
   * table is a real but separate change, left to a follow-up story rather
   * than folded into this one (see this package's `rerank/mmr.ts` and the
   * E04-S016 evidence file for why).
   */
  readonly embedding?: Embedding;
}

export interface VectorStore extends FidelityRatedComponent {
  upsert(records: readonly VectorRecord[]): Promise<void>;
  /** Scope is REQUIRED. There is deliberately no unscoped query method. */
  query(
    embedding: Embedding,
    scope: RetrievalScope,
    limit: number,
  ): Promise<readonly RetrievalHit[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}

export class VectorStoreError extends Error {
  override readonly name = "VectorStoreError";
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
      for (const record of records) {
        if (typeof record.scopeKey !== "string" || record.scopeKey.trim() === "") {
          throw new VectorStoreError(
            `chunk ${record.chunkId} 缺少 scopeKey。沒有範圍的資料無法被授權過濾,` +
              `寫入時就必須擋下,否則它會對所有人可見。`,
          );
        }
        rows.set(record.chunkId, record);
      }
    },

    async query(embedding, scope, limit) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new VectorStoreError("limit 必須是正整數。");
      }
      const allowed = buildScopePredicate(scope);

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
