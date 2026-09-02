/**
 * The walking skeleton, end to end, at PF1.
 *
 * This is the test that did not exist for the first 224 stories: one that
 * crosses every seam in a single run. Each assertion below names the AC it
 * proves and the tier that AC requires, so a reader can check the claim
 * against the evidence without trusting the test title.
 *
 * Nothing here needs a model, a GPU, a container or a network. It is meant to
 * pass on a laptop that is already running seven other things.
 */

import { describe, expect, it } from "vitest";

import { RagPipeline } from "../src/pipeline.js";
import { createDeterministicEmbeddingProvider } from "../src/embedding/model-gateway-deterministic.provider.js";
import { createCannedGenerationProvider } from "../src/generation/model-gateway-canned.provider.js";
import { createInMemoryVectorStore } from "../src/vector/store.js";
import { toRetrievalScope, ScopeLeakError } from "@ai-km/service-retrieval";
import { ProviderFidelityError } from "../src/evidence-tier.js";

const MAINTENANCE_DOC = {
  documentId: "doc-maintenance-001",
  scopeKey: "dept:maintenance",
  text: [
    "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。",
    "",
    "軸承溫度超過攝氏八十度視為異常。潤滑油每運轉兩千小時更換一次。",
    "",
    "更換潤滑油後須重新校正對心,並填寫維修紀錄表 MF-207。",
  ].join("\n"),
};

const FINANCE_DOC = {
  documentId: "doc-finance-001",
  scopeKey: "dept:finance",
  text: [
    "年度預算編列作業要點。各部門應於十月底前提出次年度預算草案。",
    "",
    "資本支出超過新台幣五百萬元者,須經董事會核准後方可執行。",
  ].join("\n"),
};

function buildPipeline(): RagPipeline {
  return new RagPipeline({
    embedding: createDeterministicEmbeddingProvider({ dimensions: 256 }),
    generation: createCannedGenerationProvider(),
    store: createInMemoryVectorStore(),
    chunking: { targetSize: 60, overlap: 10, boundarySearchWindow: 40 },
  });
}

describe("walking skeleton — 端到端管線", () => {
  it("AC1 (PF1) 匯入後 chunk 進入 store,且保留原文偏移量供引用定位", async () => {
    const pipeline = buildPipeline();
    pipeline.requireFidelity("PF1");

    const count = await pipeline.ingest([MAINTENANCE_DOC, FINANCE_DOC]);
    expect(count).toBeGreaterThan(2);

    const scope = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });
    const result = await pipeline.ask("軸承過熱要怎麼處理", scope, 3);

    expect(result.retrieved.length).toBeGreaterThan(0);
    for (const hit of result.retrieved) {
      expect(hit.endOffset).toBeGreaterThan(hit.startOffset);
      // The offsets must address the ORIGINAL document, not the chunk.
      const original = MAINTENANCE_DOC.text.slice(hit.startOffset, hit.endOffset);
      expect(original).toBe(hit.text);
    }
  });

  it("AC2 (PF1) 檢索排序有意義——查詢命中的段落排在無關段落之前", async () => {
    const pipeline = buildPipeline();
    await pipeline.ingest([MAINTENANCE_DOC]);

    const scope = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });
    const result = await pipeline.ask("潤滑油多久更換一次", scope, 3);

    expect(result.retrieved.length).toBeGreaterThan(0);
    expect(result.retrieved[0]!.text).toContain("潤滑油");
    // Scores must be ordered; an unsorted store would still "return results".
    const scores = result.retrieved.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("AC3 (PF1) Deny-Wins:未授權部門的文件絕不出現在檢索結果或引用中", async () => {
    const pipeline = buildPipeline();
    await pipeline.ingest([MAINTENANCE_DOC, FINANCE_DOC]);

    const maintenanceOnly = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });

    // A query whose best lexical match is deliberately in the finance doc.
    const result = await pipeline.ask("資本支出需要董事會核准嗎", maintenanceOnly, 5);

    for (const hit of result.retrieved) {
      expect(hit.scopeKey).toBe("dept:maintenance");
      expect(hit.documentId).not.toBe(FINANCE_DOC.documentId);
    }
    for (const citation of result.citations) {
      expect(citation.documentId).not.toBe(FINANCE_DOC.documentId);
    }
  });

  it("AC3b (PF1) 空授權範圍 = 拒絕全部,而非放行全部", async () => {
    const pipeline = buildPipeline();
    await pipeline.ingest([MAINTENANCE_DOC, FINANCE_DOC]);

    const noAccess = toRetrievalScope({ principalId: "u-new", allowedScopeKeys: [] });
    const result = await pipeline.ask("軸承過熱", noAccess, 5);

    expect(result.retrieved).toHaveLength(0);
    expect(result.citations).toHaveLength(0);
  });

  it("AC4 (PF1) 引用必為 context 子集——捏造來源會被擋下", async () => {
    const pipeline = new RagPipeline({
      embedding: createDeterministicEmbeddingProvider({ dimensions: 256 }),
      store: createInMemoryVectorStore(),
      chunking: { targetSize: 60, overlap: 10 },
      // A provider that invents a source it was never given.
      generation: {
        componentId: "generation:rogue",
        fidelityCeiling: "PF1",
        async generate() {
          return {
            answer: "捏造的回答",
            citations: [
              {
                chunkId: "doc-does-not-exist#0",
                documentId: "doc-does-not-exist",
                startOffset: 0,
                endOffset: 1,
              },
            ],
          };
        },
      },
    });
    await pipeline.ingest([MAINTENANCE_DOC]);

    const scope = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });

    await expect(pipeline.ask("軸承", scope, 3)).rejects.toThrow(/不在 context 內/);
  });

  it("AC5 (PF1) 洩漏偵測是主動的——store 若忽略範圍謂詞,管線會拋錯而非靜默過濾", async () => {
    const leakyStore = {
      componentId: "vector-store:leaky",
      fidelityCeiling: "PF1" as const,
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

    const pipeline = new RagPipeline({
      embedding: createDeterministicEmbeddingProvider({ dimensions: 256 }),
      generation: createCannedGenerationProvider(),
      store: leakyStore,
    });

    const scope = toRetrievalScope({
      principalId: "u-alice",
      allowedScopeKeys: ["dept:maintenance"],
    });

    await expect(pipeline.ask("任何問題", scope, 3)).rejects.toBeInstanceOf(ScopeLeakError);
  });
});

describe("provider fidelity 守門", () => {
  it("宣稱 PF3 但使用假 provider 時,測試在斷言之前就失敗", () => {
    const pipeline = buildPipeline();
    expect(pipeline.fidelity).toBe("PF1");
    expect(() => pipeline.requireFidelity("PF3")).toThrow(ProviderFidelityError);
    // The error must name the offending components, or it is not actionable.
    expect(() => pipeline.requireFidelity("PF3")).toThrow(/embedding:deterministic/);
  });

  it("宣稱 PF1 時通過——較低層級的宣稱不受阻擋", () => {
    const pipeline = buildPipeline();
    expect(() => pipeline.requireFidelity("PF1")).not.toThrow();
  });
});
