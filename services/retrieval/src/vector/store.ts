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
 * stores on 2026-09-02 (see `docs/stories/specs/E06-S043.spec.md`).
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
