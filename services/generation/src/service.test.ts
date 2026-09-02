/**
 * `GenerationService.answer()` (E04-S063) — the second half of
 * `@ai-km/rag-skeleton`'s `RagPipeline.ask()` (this story's explicit
 * reference), now living in its own service. `services/retrieval`'s
 * `retrieve()` (E04-S062) is the first half and is not exercised here —
 * these tests build `RetrievalHit`s directly, the way
 * `services/retrieval/src/service.test.ts` builds `VectorRecord`s directly,
 * to prove `answer()`'s own contract in isolation: given hits already
 * authorised and retrieved, assemble context, call the gateway, and return a
 * grounded answer.
 *
 * Every provider injected below is the model-gateway's own `GenerationProvider`
 * shape (`@ai-km/service-model-gateway`'s `generation/provider.ts`), passed
 * through `GenerationServiceOptions.generation` — exactly the seam
 * `createGenerationService()` wraps in a gateway. This lets these tests see
 * precisely what crosses the `services/generation` → model-gateway boundary,
 * which is the whole point of AC3 below.
 */
import { describe, expect, it } from "vitest";

import { createGenerationService } from "./service.js";
import { createCannedGenerationProvider } from "@ai-km/service-model-gateway/src/generation/canned.provider.js";
import {
  FabricatedCitationError,
  type GenerateInput,
  type GenerateResult,
  type GenerationProvider,
} from "@ai-km/service-model-gateway/src/generation/provider.js";
import type { RetrievalHit } from "@ai-km/service-retrieval/src/vector/store.js";

const HIT_A: RetrievalHit = {
  chunkId: "doc-maintenance-001#0",
  documentId: "doc-maintenance-001",
  text: "軸承過熱應先停機並記錄運轉時數",
  startOffset: 0,
  endOffset: 15,
  scopeKey: "dept:maintenance",
  score: 0.93,
};

const HIT_B: RetrievalHit = {
  chunkId: "doc-maintenance-001#1",
  documentId: "doc-maintenance-001",
  text: "潤滑油每運轉兩千小時更換一次",
  startOffset: 20,
  endOffset: 34,
  scopeKey: "dept:maintenance",
  score: 0.81,
};

describe("createGenerationService().answer() — grounded generation", () => {
  it("AC1 grounded answer: citations 是提供 context 的子集，offsets/documentId 原樣回填", async () => {
    const service = createGenerationService(); // default: canned model-gateway provider
    const result = await service.answer("軸承過熱要怎麼處理", [HIT_A, HIT_B]);

    const suppliedChunkIds = new Set([HIT_A.chunkId, HIT_B.chunkId]);
    expect(result.citations.length).toBeGreaterThan(0);
    for (const citation of result.citations) {
      expect(suppliedChunkIds.has(citation.chunkId)).toBe(true);
    }

    const citationA = result.citations.find((c) => c.chunkId === HIT_A.chunkId);
    expect(citationA).toEqual({
      chunkId: HIT_A.chunkId,
      documentId: HIT_A.documentId,
      startOffset: HIT_A.startOffset,
      endOffset: HIT_A.endOffset,
    });
  });

  it("AC2 provider 捏造引用時整個回應被拒絕——不是把壞的那條濾掉", async () => {
    const rogue: GenerationProvider = {
      name: "fake",
      model: "generation:rogue",
      fidelityCeiling: "PF1",
      async generate(input: GenerateInput): Promise<GenerateResult> {
        return {
          answer: "看起來正常的回答，其實引用被捏造",
          citations: [
            // One real citation (so a naive "filter the bad ones" implementation
            // would still return this one) plus one fabricated source.
            {
              chunkId: input.context[0]!.chunkId,
              documentId: input.context[0]!.documentId,
              startOffset: input.context[0]!.startOffset,
              endOffset: input.context[0]!.endOffset,
            },
            {
              chunkId: "doc-does-not-exist#0",
              documentId: "doc-does-not-exist",
              startOffset: 0,
              endOffset: 1,
            },
          ],
          model: "generation:rogue",
        };
      },
    };

    const service = createGenerationService({ generation: rogue });
    await expect(service.answer("軸承", [HIT_A])).rejects.toBeInstanceOf(FabricatedCitationError);
  });

  it("AC3 scopeKey 永不抵達 gateway 或 provider——整個 hit 洩漏會讓這條測試變紅", async () => {
    let capturedContext: GenerateInput["context"] | undefined;
    const spy: GenerationProvider = {
      name: "fake",
      model: "generation:spy",
      fidelityCeiling: "PF1",
      async generate(input: GenerateInput): Promise<GenerateResult> {
        capturedContext = input.context;
        return { answer: "spy", citations: [], model: "generation:spy" };
      },
    };

    const service = createGenerationService({ generation: spy });
    await service.answer("軸承過熱", [HIT_A]);

    expect(capturedContext).toBeDefined();
    expect(capturedContext).toHaveLength(1);
    const forwarded = capturedContext![0]!;

    // Every field a ContextChunk is allowed to carry, unchanged from the hit.
    expect(forwarded.chunkId).toBe(HIT_A.chunkId);
    expect(forwarded.documentId).toBe(HIT_A.documentId);
    expect(forwarded.text).toBe(HIT_A.text);
    expect(forwarded.startOffset).toBe(HIT_A.startOffset);
    expect(forwarded.endOffset).toBe(HIT_A.endOffset);
    expect(forwarded.score).toBe(HIT_A.score);

    // THE ONE THAT MATTERS: no scopeKey on the wire. If `buildContext()` were
    // ever replaced with a spread (`{...hit}`) or `JSON.stringify(hits)`,
    // this would flip to `true` while every assertion above stayed green.
    expect(Object.prototype.hasOwnProperty.call(forwarded, "scopeKey")).toBe(false);
    expect(JSON.stringify(forwarded)).not.toContain("scopeKey");
    expect(JSON.stringify(forwarded)).not.toContain("dept:maintenance");
  });

  it("AC4 空 context 是真正的短路——generation provider 完全不會被呼叫", async () => {
    let generateCallCount = 0;
    const mustNotBeCalled: GenerationProvider = {
      name: "fake",
      model: "generation:must-not-be-called",
      fidelityCeiling: "PF1",
      async generate(): Promise<never> {
        generateCallCount += 1;
        throw new Error(
          "generation provider 不應該在空 context 時被呼叫——" +
            "這代表 answer() 的早期返回被移除或繞過了。",
        );
      },
    };

    const service = createGenerationService({ generation: mustNotBeCalled });
    const result = await service.answer("軸承過熱", []);

    // 短路本身:provider 一次都沒被呼叫。
    expect(generateCallCount).toBe(0);

    expect(result.citations).toEqual([]);
    // 釘住這條路徑目前實際產生的使用者可見文字,防止它無聲漂移。
    expect(result.answer).toBe("沒有可引用的來源,無法回答:軸承過熱");
  });

  it("AC5 citation 的 offsets 仍指向原始文件文字", async () => {
    const originalText =
      "泵浦異常處理程序。當離心泵出現軸承過熱時,應先停機並記錄運轉時數。潤滑油每運轉兩千小時更換一次。";
    const snippet = "應先停機並記錄運轉時數";
    const startOffset = originalText.indexOf(snippet);
    expect(startOffset).toBeGreaterThanOrEqual(0);
    const endOffset = startOffset + snippet.length;

    const hit: RetrievalHit = {
      chunkId: "doc-maintenance-002#0",
      documentId: "doc-maintenance-002",
      text: snippet,
      startOffset,
      endOffset,
      scopeKey: "dept:maintenance",
      score: 0.87,
    };

    const service = createGenerationService(); // default canned provider
    const result = await service.answer("停機程序", [hit]);

    const citation = result.citations.find((c) => c.chunkId === hit.chunkId);
    expect(citation).toBeDefined();
    // The offsets must address the ORIGINAL document, not the chunk in isolation.
    expect(originalText.slice(citation!.startOffset, citation!.endOffset)).toBe(snippet);
  });
});

describe("createGenerationService() — input validation", () => {
  it("空字串問題被拒絕，不會靜默當成任何一種答案", async () => {
    const service = createGenerationService({ generation: createCannedGenerationProvider() });
    await expect(service.answer("", [HIT_A])).rejects.toThrow(/question 不得為空字串/);
  });
});
