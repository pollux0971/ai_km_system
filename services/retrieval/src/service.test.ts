/**
 * `RetrievalService.retrieve()` (E04-S062) — the walking skeleton's
 * AC1/AC2/AC3/AC3b/AC5 (`@ai-km/rag-skeleton`'s
 * `tests/walking-skeleton.integration.test.ts`) rewritten to this layer, now
 * that `retrieve()` is the real implementation rather than a throwing
 * scaffold.
 *
 * These tests build `VectorRecord`s directly and `store.upsert()` them,
 * rather than going through chunking/ingestion (`services/ingestion`,
 * `@ai-km/rag-skeleton`'s `RagPipeline.ingest()`) — that pipeline is a
 * different package's story (E06-S042). What this file proves is
 * `retrieve()`'s own contract: given records already sitting in the store,
 * embed the query, apply the scope, and return hits ordered best-first
 * without leaking.
 */
import { describe, expect, it } from "vitest";

import { createRetrievalService, createModelGatewayEmbeddingProvider } from "./service.js";
import { createInMemoryVectorStore, type VectorRecord, type VectorStore } from "./vector/store.js";
import { toRetrievalScope, ScopeLeakError } from "./authorization/scope.js";
import { EmbeddingError, type EmbeddingProvider } from "./embedding/provider.js";

const MAINTENANCE_TEXT = [
  "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
  "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
].join("\n\n");

const FINANCE_TEXT = "年度預算編列作業要點。資本支出超過新台幣五百萬元者,須經董事會核准後方可執行。";

/** A hand-built chunk: the offsets are computed against the ORIGINAL text, matching what real chunking (out of this story's scope) is contracted to produce. */
function makeChunk(fullText: string, snippet: string): { readonly text: string; readonly startOffset: number; readonly endOffset: number } {
  const startOffset = fullText.indexOf(snippet);
  if (startOffset < 0) throw new Error(`fixture 錯誤:「${snippet}」不在原文中`);
  return { text: snippet, startOffset, endOffset: startOffset + snippet.length };
}

async function seed(
  store: VectorStore,
  embedding: EmbeddingProvider,
  docs: readonly { documentId: string; scopeKey: string; fullText: string; snippets: readonly string[] }[],
): Promise<void> {
  const records: VectorRecord[] = [];
  for (const doc of docs) {
    const chunks = doc.snippets.map((s) => makeChunk(doc.fullText, s));
    const vectors = await embedding.embed(chunks.map((c) => c.text));
    chunks.forEach((chunk, i) => {
      records.push({
        chunkId: `${doc.documentId}#${i}`,
        documentId: doc.documentId,
        text: chunk.text,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        scopeKey: doc.scopeKey,
        embedding: vectors[i]!,
      });
    });
  }
  await store.upsert(records);
}

const MAINTENANCE_SNIPPETS = [
  "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
  "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
] as const;

describe("RetrievalService.retrieve() (E04-S062)", () => {
  it("AC-R1 (PF1) 已授權檢索:排序最佳者在前,且所有命中都在授權範圍內", async () => {
    const store = createInMemoryVectorStore();
    const embedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
    await seed(store, embedding, [
      { documentId: "doc-maintenance-001", scopeKey: "dept:maintenance", fullText: MAINTENANCE_TEXT, snippets: MAINTENANCE_SNIPPETS },
      { documentId: "doc-finance-001", scopeKey: "dept:finance", fullText: FINANCE_TEXT, snippets: [FINANCE_TEXT] },
    ]);

    const service = createRetrievalService({ store, embedding });
    const scope = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });

    const hits = await service.retrieve("潤滑油多久更換一次", scope, 5);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.text).toContain("潤滑油");
    // Scores must be ordered; an unsorted store would still "return results".
    const scores = hits.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Deny-Wins, positively: every hit is inside the caller's scope.
    for (const hit of hits) {
      expect(hit.scopeKey).toBe("dept:maintenance");
      expect(hit.documentId).not.toBe("doc-finance-001");
    }
  });

  it("AC-R2 (PF1) 空授權範圍 = 拒絕全部,回傳零筆而非拋錯", async () => {
    const store = createInMemoryVectorStore();
    const embedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
    await seed(store, embedding, [
      { documentId: "doc-maintenance-001", scopeKey: "dept:maintenance", fullText: MAINTENANCE_TEXT, snippets: MAINTENANCE_SNIPPETS },
    ]);

    const service = createRetrievalService({ store, embedding });
    const noAccess = toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] });

    const hits = await service.retrieve("軸承過熱", noAccess, 5);
    expect(hits).toHaveLength(0);
  });

  it("AC-R3 (PF1) 洩漏偵測是主動的——store 若忽略範圍謂詞,retrieve() 會拋 ScopeLeakError 而非靜默過濾", async () => {
    const embedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
    // A store that ignores the scope predicate entirely — mirrors
    // rag-skeleton's AC5 leaky-store fixture.
    const leakyStore: VectorStore = {
      componentId: "vector-store:leaky",
      fidelityCeiling: "PF1",
      async upsert() {},
      async query() {
        return [
          {
            chunkId: "x#0",
            documentId: "doc-finance-001",
            text: "洩漏的財務內容",
            startOffset: 0,
            endOffset: 7,
            scopeKey: "dept:finance",
            score: 1,
          },
        ];
      },
      async count() {
        return 1;
      },
      async close() {},
    };

    const service = createRetrievalService({ store: leakyStore, embedding });
    const scope = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });

    await expect(service.retrieve("任何問題", scope, 3)).rejects.toBeInstanceOf(ScopeLeakError);
  });

  it("AC-R4 (PF1) offsets 仍然對應原始文件全文,而不是對應 chunk 自己的座標", async () => {
    const store = createInMemoryVectorStore();
    const embedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
    await seed(store, embedding, [
      { documentId: "doc-maintenance-001", scopeKey: "dept:maintenance", fullText: MAINTENANCE_TEXT, snippets: MAINTENANCE_SNIPPETS },
      { documentId: "doc-finance-001", scopeKey: "dept:finance", fullText: FINANCE_TEXT, snippets: [FINANCE_TEXT] },
    ]);

    const service = createRetrievalService({ store, embedding });
    const scope = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });

    const hits = await service.retrieve("軸承過熱要怎麼處理", scope, 5);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.endOffset).toBeGreaterThan(hit.startOffset);
      const original = MAINTENANCE_TEXT.slice(hit.startOffset, hit.endOffset);
      expect(original).toBe(hit.text);
    }
  });

  it(
    "AC-R5 (PF1) 查詢期 embedding 的 provider 必須與寫入時相同——維度不符時 retrieve() 會拋錯而非靜默算出無意義排序;" +
      "同維度但語意不同的漂移無法在這一層測出(見本檔與 service.ts 頂端註解、E06-S026)",
    async () => {
      const storeSideEmbedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
      const store = createInMemoryVectorStore();
      await seed(store, storeSideEmbedding, [
        { documentId: "doc-maintenance-001", scopeKey: "dept:maintenance", fullText: MAINTENANCE_TEXT, snippets: MAINTENANCE_SNIPPETS },
      ]);

      // A DIFFERENT provider configuration — different dimensionality — than
      // the one that produced the stored vectors. Nothing in this package
      // tracks provider identity/version (that gap is E06-S026's), so this
      // is the one form of "wrong provider at query time" this layer CAN
      // catch: `dot()` (embedding/provider.ts) refuses to score vectors of
      // mismatched length rather than silently producing a number.
      const queryTimeEmbedding = createModelGatewayEmbeddingProvider({ dimensions: 32 });
      const service = createRetrievalService({ store, embedding: queryTimeEmbedding });
      const scope = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });

      await expect(service.retrieve("軸承過熱", scope, 5)).rejects.toBeInstanceOf(EmbeddingError);
    },
  );
});
