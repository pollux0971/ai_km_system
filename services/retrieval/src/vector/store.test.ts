/**
 * E06-S043 — same `documentId`, different `scopeKey` re-ingest must be
 * refused, writing nothing; same `documentId`, same `scopeKey` re-ingest must
 * atomically replace the document's chunks (surplus old chunks from a
 * shrinking document must not survive).
 *
 * These tests exercise `createInMemoryVectorStore()` directly — the
 * sqlite-vec store gets the SAME scenarios re-run against real SQL in
 * `tests/sqlite-vec-store.integration.test.ts` (AC5: both stores must behave
 * identically).
 *
 * AC1 IS NOT "an error was thrown". Per the spec's explicit rule
 * (`archive/stories/specs/E06-S043.spec.md` — "反向驗證"), an existence
 * assertion does not prove anything about the property this story guards.
 * Every AC1 test below asserts finance's query result is IDENTICAL, item by
 * item, before and after the refused re-ingest.
 */
import { describe, expect, it } from "vitest";

import {
  createInMemoryVectorStore,
  DocumentScopeConflictError,
  VectorStoreError,
  type VectorRecord,
} from "./store.js";
import { toRetrievalScope } from "../authorization/scope.js";

const FINANCE_SCOPE = toRetrievalScope({ principalId: "u-fin", allowedScopeKeys: ["dept:finance"] });
const MAINTENANCE_SCOPE = toRetrievalScope({
  principalId: "u-maint",
  allowedScopeKeys: ["dept:maintenance"],
});

const QUERY = Float32Array.from([1, 0]);

function chunk(
  documentId: string,
  ordinal: number,
  scopeKey: string,
  embedding: readonly number[],
  text = `${documentId}#${ordinal} 的內容`,
): VectorRecord {
  return {
    chunkId: `${documentId}#${ordinal}`,
    documentId,
    text,
    startOffset: 0,
    endOffset: text.length,
    scopeKey,
    embedding: Float32Array.from(embedding),
  };
}

/** Two chunks, so the "shrinking" test (AC3) has something to shrink from. */
function financeDocV1(): VectorRecord[] {
  return [
    chunk("doc-1", 0, "dept:finance", [1, 0], "第一段:年度預算編列作業要點"),
    chunk("doc-1", 1, "dept:finance", [0.9, 0.1], "第二段:資本支出核准門檻"),
  ];
}

describe("createInMemoryVectorStore — E06-S043 re-ingest scope guard", () => {
  it("AC1 ★ 不同 scope 重匯被拒——finance 重匯前後查詢結果逐筆相同(不是「有拋錯」)", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1());

    const before = await store.query(QUERY, FINANCE_SCOPE, 10);
    expect(before).toHaveLength(2);

    // Capture the rejection WITHOUT asserting on it yet. `.rejects.toBe
    // InstanceOf(...)` used to sit here directly — vitest aborts a test at
    // its first failing assertion, so under reverse verification (guard
    // disabled) that line failed first with "promise resolved undefined
    // instead of rejecting" and the identity check below never ran. That is
    // exactly the "an error was thrown" failure mode this test's own header
    // comment says AC1 must not reduce to. See E06-S043 EVIDENCE for the
    // fix (Phase 4 §5 narrow exception — test's own technical defect).
    let thrown: unknown;
    try {
      await store.upsert([chunk("doc-1", 0, "dept:maintenance", [1, 0])]);
    } catch (err) {
      thrown = err;
    }

    // Data first: this is what must fail when the guard is removed.
    const after = await store.query(QUERY, FINANCE_SCOPE, 10);
    // Item-by-item identity, not just length — this is the assertion the
    // spec's reverse-verification note requires.
    expect(after).toEqual(before);

    // Then the error contract.
    expect(thrown).toBeInstanceOf(DocumentScopeConflictError);
  });

  it("AC2 承上:maintenance 看不到任何東西,不得有部分寫入", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1());

    // Same reordering as AC1 above: capture, don't assert yet.
    let thrown: unknown;
    try {
      await store.upsert([chunk("doc-1", 0, "dept:maintenance", [1, 0])]);
    } catch (err) {
      thrown = err;
    }

    const maintenanceHits = await store.query(QUERY, MAINTENANCE_SCOPE, 10);
    expect(maintenanceHits).toEqual([]);
    // The store's total row count is also unchanged — no partial write of
    // the rejected maintenance chunk sitting invisibly in the store.
    expect(await store.count()).toBe(2);

    expect(thrown).toBeInstanceOf(DocumentScopeConflictError);
  });

  it("AC6 錯誤帶有穩定 code,訊息說明是 scope 變更被拒且不只說「匯入失敗」,也不洩漏目前的 scopeKey", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1());

    try {
      await store.upsert([chunk("doc-1", 0, "dept:maintenance", [1, 0])]);
      expect.unreachable("must throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentScopeConflictError);
      const e = err as DocumentScopeConflictError;
      expect(e.code).toBe("DOCUMENT_SCOPE_CONFLICT");
      expect(e.message).not.toBe("匯入失敗");
      expect(e.message).toMatch(/scopeKey/);
      // Security AC: must not disclose the document's actual current scope.
      expect(e.message).not.toContain("dept:finance");
      expect(e.message).not.toContain("dept:maintenance");
    }
  });

  it("AC3 ★ 相同 scope 重匯較短版本(chunk 數變少)→ 舊版多出來的 chunk 不存在於庫中", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1()); // 2 chunks: doc-1#0, doc-1#1

    // New version has only ONE chunk — a shrinking re-ingest.
    await store.upsert([chunk("doc-1", 0, "dept:finance", [1, 0], "合併後的單一段落")]);

    expect(await store.count()).toBe(1);
    const hits = await store.query(QUERY, FINANCE_SCOPE, 10);
    expect(hits.map((h) => h.chunkId)).toEqual(["doc-1#0"]);
    expect(hits[0]?.text).toBe("合併後的單一段落");
    // The surplus old chunk must be gone, not just unreachable — no query
    // result should ever be able to point at it again.
    expect(hits.some((h) => h.chunkId === "doc-1#1")).toBe(false);
  });

  it("AC3b 相同 scope 重匯較長版本(chunk 數變多)一樣是完整替換", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert([chunk("doc-1", 0, "dept:finance", [1, 0], "唯一一段")]);

    await store.upsert([
      chunk("doc-1", 0, "dept:finance", [1, 0], "新版第一段"),
      chunk("doc-1", 1, "dept:finance", [0.9, 0.1], "新版第二段"),
      chunk("doc-1", 2, "dept:finance", [0.8, 0.2], "新版第三段"),
    ]);

    expect(await store.count()).toBe(3);
    const hits = await store.query(QUERY, FINANCE_SCOPE, 10);
    expect(hits.map((h) => h.chunkId).sort()).toEqual(["doc-1#0", "doc-1#1", "doc-1#2"]);
  });

  it("AC4 替換途中驗證失敗 → 完全不寫入,舊 chunk 原封不動(新舊不混合)", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1());
    const before = await store.query(QUERY, FINANCE_SCOPE, 10);

    // Same documentId + same scopeKey overall intent, but one record in the
    // batch has no scopeKey at all — Phase 1 must reject the WHOLE batch
    // before Phase 2 (the replace) ever starts.
    // Same "capture, don't assert yet" reordering as AC1/AC2: this test
    // wasn't on the reviewer's list (this particular reverse verification
    // doesn't touch the missing-scopeKey validation), but it has the exact
    // same throw-before-data-assertion shape guarding the same kind of
    // atomicity claim, so it gets the same defensive fix.
    let thrown: unknown;
    try {
      await store.upsert([
        chunk("doc-1", 0, "dept:finance", [1, 0], "新版第一段"),
        { ...chunk("doc-1", 1, "dept:finance", [0.9, 0.1], "新版第二段"), scopeKey: "" },
      ]);
    } catch (err) {
      thrown = err;
    }

    const after = await store.query(QUERY, FINANCE_SCOPE, 10);
    expect(after).toEqual(before);
    expect(await store.count()).toBe(2);

    expect(thrown).toBeInstanceOf(VectorStoreError);
  });

  it("同一次 upsert 呼叫本身對同一 documentId 帶兩個不同 scopeKey → 一樣拒絕,一樣不寫入", async () => {
    const store = createInMemoryVectorStore();

    // Found while re-reading beyond the reviewer's list: this test hits the
    // SAME `checkDocumentScopeConsistency` guard as AC1/AC2 (its
    // batch-internal-conflict branch), so it fails the identical way under
    // reverse verification #1 — capture first, assert data, then error type.
    let thrown: unknown;
    try {
      await store.upsert([
        chunk("doc-2", 0, "dept:finance", [1, 0]),
        chunk("doc-2", 1, "dept:maintenance", [0.9, 0.1]),
      ]);
    } catch (err) {
      thrown = err;
    }

    expect(await store.count()).toBe(0);
    expect(thrown).toBeInstanceOf(DocumentScopeConflictError);
  });

  it("不同 documentId 之間互不影響——同一次呼叫可以混合多個文件、各自的 scope", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert([
      chunk("doc-a", 0, "dept:finance", [1, 0]),
      chunk("doc-b", 0, "dept:maintenance", [0, 1]),
    ]);
    expect(await store.count()).toBe(2);
  });

  it("重匯完全相同的內容(相同 scope、相同 chunk 集合)是幂等的", async () => {
    const store = createInMemoryVectorStore();
    await store.upsert(financeDocV1());
    await store.upsert(financeDocV1());
    expect(await store.count()).toBe(2);
    const hits = await store.query(QUERY, FINANCE_SCOPE, 10);
    expect(hits.map((h) => h.chunkId).sort()).toEqual(["doc-1#0", "doc-1#1"]);
  });
});
