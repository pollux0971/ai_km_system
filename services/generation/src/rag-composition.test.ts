/**
 * Cross-service composition test — written while retiring
 * `services/rag-skeleton` (E04-S064).
 *
 * `services/retrieval`'s `service.test.ts` (AC-R1) proves `retrieve()` itself
 * never returns a hit outside the caller's scope. `services/generation`'s
 * `service.test.ts` (AC3) proves `scopeKey` never crosses the wire to the
 * Model Gateway. Neither file proves the thing `@ai-km/rag-skeleton`'s
 * `walking-skeleton.integration.test.ts` AC3 proved end to end: that when a
 * REAL `retrieve()` call's hits are fed into a REAL `answer()` call, the
 * FINAL CITATIONS a caller sees never name a document outside the caller's
 * authorised scope — even when the query's best lexical match sits in an
 * unauthorised document. That is a claim about the COMPOSITION of the two
 * services, not about either one alone; two independently-correct halves can
 * still be wrong at the seam between them. `E04-S064`'s replacement table
 * found this as a genuine gap (no existing test wires a real `retrieve()`
 * result into a real `answer()` call), so this file is the relocation, not a
 * restatement of an existing test under a new name.
 */
import { describe, expect, it } from "vitest";

import { createGenerationService } from "./service.js";
import {
  createInMemoryVectorStore,
  createRetrievalService,
  createModelGatewayEmbeddingProvider,
  toRetrievalScope,
  type VectorRecord,
  type VectorStore,
  type EmbeddingProvider,
} from "@ai-km/service-retrieval";

const MAINTENANCE_TEXT = [
  "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
  "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
].join("\n\n");

const FINANCE_TEXT = "年度預算編列作業要點。資本支出超過新台幣五百萬元者,須經董事會核准後方可執行。";

const MAINTENANCE_SNIPPETS = [
  "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
  "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
] as const;

function makeChunk(
  fullText: string,
  snippet: string,
): { readonly text: string; readonly startOffset: number; readonly endOffset: number } {
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

describe("retrieve() → answer() composition (E04-S064 relocation of rag-skeleton AC3)", () => {
  it(
    "AC3-composition (PF1) Deny-Wins 端到端:查詢的最佳字面命中在未授權文件中時," +
      "retrieve() 的結果經 answer() 產生的引用仍不含該文件",
    async () => {
      const store = createInMemoryVectorStore();
      const embedding = createModelGatewayEmbeddingProvider({ dimensions: 64 });
      await seed(store, embedding, [
        {
          documentId: "doc-maintenance-001",
          scopeKey: "dept:maintenance",
          fullText: MAINTENANCE_TEXT,
          snippets: MAINTENANCE_SNIPPETS,
        },
        {
          documentId: "doc-finance-001",
          scopeKey: "dept:finance",
          fullText: FINANCE_TEXT,
          snippets: [FINANCE_TEXT],
        },
      ]);

      // enforceEmbeddingVersion: false — E06-S026 made this field required (not
      // optional/defaulted) on RetrievalServiceOptions; this fixture predates that
      // concept and carries no embedding identity metadata, so `false` is the
      // honest value, not a silently-inherited default.
      const retrieval = createRetrievalService({ store, embedding, enforceEmbeddingVersion: false });
      const generation = createGenerationService();
      const scope = toRetrievalScope({ principalId: "u-alice", allowedScopeKeys: ["dept:maintenance"] });

      // A query whose best lexical match is deliberately in the finance doc —
      // same adversarial shape as rag-skeleton's AC3.
      const hits = await retrieval.retrieve("資本支出需要董事會核准嗎", scope, 5);
      for (const hit of hits) {
        expect(hit.scopeKey).toBe("dept:maintenance");
        expect(hit.documentId).not.toBe("doc-finance-001");
      }

      const result = await generation.answer("資本支出需要董事會核准嗎", hits);
      for (const citation of result.citations) {
        expect(citation.documentId).not.toBe("doc-finance-001");
      }
    },
  );
});
