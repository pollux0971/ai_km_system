/**
 * The index pipeline (E06-S042): parse → chunk → embed(Model Gateway
 * in-process) → store.
 *
 * The centrepiece is the W1-00 test below: a real Chinese PDF, run through
 * the whole pipeline with the deterministic embedding provider and an
 * in-memory store, queried with a `RetrievalScope` built directly by
 * `toRetrievalScope()` (E04-S009 — deriving scope from identity — is
 * `blocked-team-b`; no interim mapping is invented here). The assertion that
 * matters is that a returned hit's offsets index the stored extracted text
 * byte for byte — that is what makes a citation verifiable by the person
 * reading the answer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createInMemoryVectorStore,
  toRetrievalScope,
  DocumentScopeConflictError,
} from "@ai-km/service-retrieval";
import { createModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "@ai-km/service-model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "@ai-km/service-model-gateway/src/generation/provider.js";
import type { ModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";
import type { VectorStore } from "@ai-km/service-retrieval";

import { extractPdfText, PdfEmptyTextError } from "./extraction/pdf-extract.js";
import { createIngestionService, IngestionScopeError, IngestionValidationError } from "./service.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(dir, "extraction/fixtures", name)));
}

/**
 * Never invoked — this test only ever calls `gateway.embed()`. Same shape as
 * `services/rag-skeleton/src/embedding/model-gateway-deterministic.provider.ts`'s
 * `UNUSED_GENERATION_PROVIDER`: `createModelGateway` requires a `generation`
 * dependency even though nothing here calls `.generate()`.
 */
const UNUSED_GENERATION_PROVIDER: GenerationProvider = {
  name: "fake",
  model: "ingestion-pipeline-test-embedding-only",
  fidelityCeiling: "PF1",
  async generate(): Promise<never> {
    throw new Error("此測試只用於 embedding,generate() 不應被呼叫。");
  },
};

function buildDeps(): { modelGateway: ModelGateway; vectorStore: VectorStore } {
  const embedding = createDeterministicEmbeddingProvider();
  const modelGateway = createModelGateway({ embedding, generation: UNUSED_GENERATION_PROVIDER });
  const vectorStore = createInMemoryVectorStore();
  return { modelGateway, vectorStore };
}

describe("IngestionService.ingest (E06-S042)", () => {
  it("W1-00 ★ 真實中文 PDF 端到端跑通,引用偏移量逐字指回原文", async () => {
    const { modelGateway, vectorStore } = buildDeps();
    const service = createIngestionService({ modelGateway, vectorStore });

    // Two SEPARATE reads of the same fixture, deliberately — pdfjs-dist's
    // worker transport transfers/detaches the `Uint8Array`'s underlying
    // buffer on use, so passing one buffer instance through `getDocument()`
    // twice throws `DataCloneError`. Determinism (AC5 in pdf-extract.test.ts)
    // is what makes comparing the two independent reads' extractions valid.
    const { text: extractedText } = await extractPdfText(fixture("cjk-non-embedded.pdf"));

    const result = await service.ingest({
      documentId: "w1-00-doc",
      scopeKey: "dept:eng",
      pdfBytes: fixture("cjk-non-embedded.pdf"),
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.pageCount).toBe(2);
    expect(result.extractorVersion).toMatch(/^pdfjs-dist@6\.3\.289\+join-rules@\d+$/);
    expect(result.embeddingModel).toBe("embedding:deterministic");
    expect(await vectorStore.count()).toBe(result.chunkCount);

    // Query built DIRECTLY via toRetrievalScope — not derived from anything.
    const scope = toRetrievalScope({ principalId: "user-1", allowedScopeKeys: ["dept:eng"] });
    const queryEmbedResponse = await modelGateway.embed({ input: ["知識管理系統設計文件"] }, "w1-00-query");
    const queryEmbedding = Float32Array.from(queryEmbedResponse.data[0]!.embedding);

    const hits = await vectorStore.query(queryEmbedding, scope, 10);
    expect(hits.length).toBeGreaterThan(0);
    // A zero vector scores 0 against everything and would still return
    // `hits.length > 0` (the store returns top-K regardless of score) — the
    // length check alone would not catch a skipped embed step. This score
    // check is what reverse-verification #2 (skip embed, store zero vectors)
    // must turn red.
    expect(hits[0]!.score).toBeGreaterThan(0);

    for (const hit of hits) {
      // W1-00 — THE assertion: the offsets must index the stored extracted
      // text, byte for byte. This is what makes a citation verifiable by the
      // person reading the answer.
      expect(extractedText.slice(hit.startOffset, hit.endOffset)).toBe(hit.text);
    }
  });

  it("scopeKey 為空 → 拒絕寫入,store 保持空(chunk 沒有 scope 會對所有人可見)", async () => {
    const { modelGateway, vectorStore } = buildDeps();
    const service = createIngestionService({ modelGateway, vectorStore });
    const pdfBytes = fixture("cjk-non-embedded.pdf");

    await expect(
      service.ingest({ documentId: "doc-noscope", scopeKey: "", pdfBytes }),
    ).rejects.toBeInstanceOf(IngestionScopeError);
    expect(await vectorStore.count()).toBe(0);
  });

  it("未提供 input → IngestionValidationError,不得靜默視為無事可做", async () => {
    const { modelGateway, vectorStore } = buildDeps();
    const service = createIngestionService({ modelGateway, vectorStore });

    await expect(service.ingest()).rejects.toBeInstanceOf(IngestionValidationError);
    expect(await vectorStore.count()).toBe(0);
  });

  it("純圖片 PDF(抽取結果為空字串)→ fail closed,不得回報「0 個 chunk 已索引」", async () => {
    const { modelGateway, vectorStore } = buildDeps();
    const service = createIngestionService({ modelGateway, vectorStore });
    const pdfBytes = fixture("image-only.pdf");

    await expect(
      service.ingest({ documentId: "doc-empty", scopeKey: "dept:eng", pdfBytes }),
    ).rejects.toBeInstanceOf(PdfEmptyTextError);
    expect(await vectorStore.count()).toBe(0);
  });

  it(
    "E06-S043 AC1+AC2 ★ 透過真實 ingest() 入口重匯:同一 documentId 換 scope 被拒," +
      "finance 重匯前後查詢結果逐筆相同,maintenance 什麼都拿不到",
    async () => {
      const { modelGateway, vectorStore } = buildDeps();
      const service = createIngestionService({ modelGateway, vectorStore });

      // pdfjs-dist's worker transport transfers/detaches the `Uint8Array`'s
      // underlying buffer on use (same note as the W1-00 test above), so each
      // `ingest()` call below gets its OWN fresh read of the fixture.
      const first = await service.ingest({
        documentId: "reingest-doc",
        scopeKey: "dept:finance",
        pdfBytes: fixture("cjk-non-embedded.pdf"),
      });
      expect(first.chunkCount).toBeGreaterThan(0);

      const financeScope = toRetrievalScope({ principalId: "u-fin", allowedScopeKeys: ["dept:finance"] });
      const maintenanceScope = toRetrievalScope({
        principalId: "u-maint",
        allowedScopeKeys: ["dept:maintenance"],
      });
      const queryEmbedResponse = await modelGateway.embed({ input: ["知識管理系統設計文件"] }, "reingest-query");
      const queryEmbedding = Float32Array.from(queryEmbedResponse.data[0]!.embedding);

      const beforeHits = await vectorStore.query(queryEmbedding, financeScope, 20);
      expect(beforeHits.length).toBe(first.chunkCount);

      // Same documentId, DIFFERENT scopeKey — must be refused end to end,
      // through the real re-ingest entry point, not just at the store layer.
      await expect(
        service.ingest({
          documentId: "reingest-doc",
          scopeKey: "dept:maintenance",
          pdfBytes: fixture("cjk-non-embedded.pdf"),
        }),
      ).rejects.toBeInstanceOf(DocumentScopeConflictError);

      // AC1: finance's visibility is IDENTICAL, item by item — not merely
      // "an error was thrown".
      const afterHits = await vectorStore.query(queryEmbedding, financeScope, 20);
      expect(afterHits).toEqual(beforeHits);
      expect(await vectorStore.count()).toBe(first.chunkCount);

      // AC2: maintenance gets nothing — not even a partial write.
      const maintenanceHits = await vectorStore.query(queryEmbedding, maintenanceScope, 20);
      expect(maintenanceHits).toEqual([]);
    },
  );

  it("componentId 標示為真實管線,與 E06-S041 的空殼區隔", async () => {
    const { modelGateway, vectorStore } = buildDeps();
    const service = createIngestionService({ modelGateway, vectorStore });
    expect(service.componentId).toBe("ingestion:pipeline");
  });
});
