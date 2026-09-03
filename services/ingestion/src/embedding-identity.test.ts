/**
 * E06-S026 — the index pipeline's write-path half of the story: `ingest()`
 * must persist the embedding provider's reported `model`/`dimensions` onto
 * every `VectorRecord` it writes (AC1), and must refuse to write anything at
 * all when the Model Gateway does not report a usable identity (AC2),
 * rather than defaulting.
 *
 * NEW FILE — adds tests only, does not touch `pipeline.test.ts` (which
 * carries E06-S042's and E06-S043's frozen assertions, including the E06-S043
 * AC1+AC2 re-ingest test named in this story's hard constraints).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createInMemoryVectorStore, toRetrievalScope, type VectorStore } from "@ai-km/service-retrieval";
import { createModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";
import { createDeterministicEmbeddingProvider } from "@ai-km/service-model-gateway/src/embedding/deterministic.provider.js";
import type { GenerationProvider } from "@ai-km/service-model-gateway/src/generation/provider.js";
import type { EmbedResponse, GenerateResponse, ModelGateway } from "@ai-km/service-model-gateway/src/gateway.js";

import { createIngestionService, IngestionEmbeddingIdentityError } from "./service.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(dir, "extraction/fixtures", name)));
}

const UNUSED_GENERATION_PROVIDER: GenerationProvider = {
  name: "fake",
  model: "embedding-identity-test-embedding-only",
  fidelityCeiling: "PF1",
  async generate(): Promise<never> {
    throw new Error("此測試只用於 embedding,generate() 不應被呼叫。");
  },
};

/**
 * A `ModelGateway` whose `embed()` response is fully controlled by the test
 * — real `gateway.ts` validation (`EmbeddingUnavailableError` on a bad
 * `dimensions`/vector-length mismatch) is bypassed on purpose so tests can
 * reach `IngestionEmbeddingIdentityError`'s OWN guard specifically, proving
 * it is a real, independent check in `services/ingestion` and not something
 * `gateway.ts` already caught.
 */
function fakeModelGateway(response: EmbedResponse): ModelGateway {
  return {
    async embed(): Promise<EmbedResponse> {
      return response;
    },
    async generate(): Promise<GenerateResponse> {
      throw new Error("generate() 不應被呼叫。");
    },
    providers: {
      embedding: { name: "fake", model: response.model || "(missing)", fidelityCeiling: "PF1" },
      generation: { name: "fake", model: "unused", fidelityCeiling: "PF1" },
    },
  };
}

function buildRealDeps(): { modelGateway: ModelGateway; vectorStore: VectorStore } {
  const embedding = createDeterministicEmbeddingProvider({ dimensions: 32 });
  const modelGateway = createModelGateway({ embedding, generation: UNUSED_GENERATION_PROVIDER });
  const vectorStore = createInMemoryVectorStore();
  return { modelGateway, vectorStore };
}

describe("IngestionService.ingest — E06-S026 embedding identity", () => {
  it("AC1 ★ ingest() 把 Model Gateway 回報的 model/dimensions 逐值寫進每個 VectorRecord,可從 store.query() 讀回", async () => {
    const { modelGateway, vectorStore } = buildRealDeps();
    const service = createIngestionService({ modelGateway, vectorStore });

    const result = await service.ingest({
      documentId: "doc-identity",
      scopeKey: "dept:eng",
      pdfBytes: fixture("cjk-non-embedded.pdf"),
    });
    expect(result.embeddingModel).toBe("embedding:deterministic");

    const scope = toRetrievalScope({ principalId: "u-1", allowedScopeKeys: ["dept:eng"] });
    const probeVector = await modelGateway.embed({ input: ["探測用查詢"] }, "probe");
    const hits = await vectorStore.query(Float32Array.from(probeVector.data[0]!.embedding), scope, result.chunkCount);
    expect(hits.length).toBe(result.chunkCount);
    for (const hit of hits) {
      // Not an existence check — the EXACT values, matching what the
      // gateway actually reported for THIS ingest call.
      expect(hit.embeddingModel).toBe("embedding:deterministic");
      expect(hit.embeddingDimensions).toBe(32);
    }
  });

  it("AC2 ★ Model Gateway 回報空字串 model → 拒絕寫入,store 保持空(不得用預設值補齊)", async () => {
    const vectorStore = createInMemoryVectorStore();
    const modelGateway = fakeModelGateway({
      model: "",
      dimensions: 32,
      data: [],
    });
    // `data` length is per-call — fill it in once we know chunk count is
    // irrelevant, since the identity check runs before the data-length
    // check and must fire first regardless of how many chunks there are.
    const service = createIngestionService({ modelGateway, vectorStore });

    await expect(
      service.ingest({
        documentId: "doc-empty-model",
        scopeKey: "dept:eng",
        pdfBytes: fixture("cjk-non-embedded.pdf"),
      }),
    ).rejects.toBeInstanceOf(IngestionEmbeddingIdentityError);
    expect(await vectorStore.count()).toBe(0);
  });

  it("AC2b Model Gateway 回報非正整數 dimensions(0)→ 拒絕寫入,store 保持空", async () => {
    const vectorStore = createInMemoryVectorStore();
    const modelGateway = fakeModelGateway({
      model: "some-model",
      dimensions: 0,
      data: [],
    });
    const service = createIngestionService({ modelGateway, vectorStore });

    await expect(
      service.ingest({
        documentId: "doc-zero-dim",
        scopeKey: "dept:eng",
        pdfBytes: fixture("cjk-non-embedded.pdf"),
      }),
    ).rejects.toBeInstanceOf(IngestionEmbeddingIdentityError);
    expect(await vectorStore.count()).toBe(0);
  });

  it("AC2c Model Gateway 回報負數 dimensions → 拒絕寫入,store 保持空", async () => {
    const vectorStore = createInMemoryVectorStore();
    const modelGateway = fakeModelGateway({
      model: "some-model",
      dimensions: -4,
      data: [],
    });
    const service = createIngestionService({ modelGateway, vectorStore });

    await expect(
      service.ingest({
        documentId: "doc-negative-dim",
        scopeKey: "dept:eng",
        pdfBytes: fixture("cjk-non-embedded.pdf"),
      }),
    ).rejects.toBeInstanceOf(IngestionEmbeddingIdentityError);
    expect(await vectorStore.count()).toBe(0);
  });
});
