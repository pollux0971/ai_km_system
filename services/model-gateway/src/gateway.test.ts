/**
 * Model Gateway — in-process API (policy L1 unit, PF1).
 *
 * These assertions are about the gateway's own rules: validation, limits,
 * fail-closed states and the untrusted-provider check. Generation is the
 * canned provider (E12-S033); embedding is the real (ceiling PF1)
 * deterministic hasher (E12-S032) — either way nothing here speaks to vector
 * or answer QUALITY — a PF3 claim would need a real model, which E04-S037 has
 * not chosen yet.
 */
import { describe, expect, it } from "vitest";
import {
  createModelGateway,
  GenerationNoContextError,
  ModelGatewayPayloadTooLargeError,
  ModelGatewayValidationError,
} from "./gateway.js";
import { EmbeddingUnavailableError } from "./embedding/provider.js";
import { createDeterministicEmbeddingProvider } from "./embedding/deterministic.provider.js";
import {
  FabricatedCitationError,
  GenerationUnavailableError,
  type GenerationProvider,
} from "./generation/provider.js";
import { createCannedGenerationProvider } from "./generation/canned.provider.js";

const CID = "test-correlation-id";
const CONTEXT = [
  { chunkId: "doc-1#0", documentId: "doc-1", text: "泵浦於 8/12 更換軸封。", startOffset: 0, endOffset: 12 },
];

function gateway(overrides: Partial<Parameters<typeof createModelGateway>[0]> = {}) {
  return createModelGateway({
    embedding: createDeterministicEmbeddingProvider({ dimensions: 16 }),
    generation: createCannedGenerationProvider(),
    ...overrides,
  });
}

describe("ModelGateway.embed (L1, PF1)", () => {
  it("AC-G1 回傳與輸入等量、依輸入順序、帶 index 的向量", async () => {
    const result = await gateway().embed({ input: ["甲", "乙", "丙"] }, CID);
    expect(result.data.map((d) => d.index)).toEqual([0, 1, 2]);
    expect(result.dimensions).toBe(16);
    expect(result.data[0]?.embedding).toHaveLength(16);
  });

  it("AC-G2 空輸入是 validation error,不是空回應", async () => {
    await expect(gateway().embed({ input: [] }, CID)).rejects.toBeInstanceOf(
      ModelGatewayValidationError,
    );
  });

  it("AC-G3 超過 256 段是 413,不是靜默截斷", async () => {
    const input = Array.from({ length: 257 }, (_, i) => `t${i}`);
    await expect(gateway().embed({ input }, CID)).rejects.toBeInstanceOf(
      ModelGatewayPayloadTooLargeError,
    );
  });

  it("AC-G4 provider 回傳數量不符時拒絕,不回傳錯位向量", async () => {
    const misaligned = {
      name: "fake" as const,
      model: "misaligned",
      dimensions: 4,
      fidelityCeiling: "PF1" as const,
      async embed() {
        return { vectors: [[1, 0, 0, 0]], model: "misaligned", dimensions: 4 };
      },
    };
    await expect(
      gateway({ embedding: misaligned }).embed({ input: ["a", "b"] }, CID),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("AC-G4b provider 宣告的 dimensions 與實際向量長度不符時拒絕,不回傳靜默錯誤的相似度", async () => {
    const wrongDimensions = {
      name: "fake" as const,
      model: "wrong-dimensions",
      dimensions: 4,
      fidelityCeiling: "PF1" as const,
      async embed(input: { texts: readonly string[] }) {
        // Declares dimensions: 4 (matches deps.embedding.dimensions) but every
        // vector it actually returns is length 3 — the shape a misconfigured
        // real provider (E04-S037) could produce without ever throwing.
        return {
          vectors: input.texts.map(() => [1, 0, 0]),
          model: "wrong-dimensions",
          dimensions: 4,
        };
      },
    };
    await expect(
      gateway({ embedding: wrongDimensions }).embed({ input: ["a"] }, CID),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it("AC-G5 provider 失敗一律映射為 EmbeddingUnavailableError,不外洩內部例外", async () => {
    const broken = {
      name: "fake" as const,
      model: "broken",
      dimensions: 4,
      fidelityCeiling: "PF1" as const,
      async embed(): Promise<never> {
        throw new Error("ECONNREFUSED 127.0.0.1:9999");
      },
    };
    await expect(
      gateway({ embedding: broken }).embed({ input: ["a"] }, CID),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });
});

describe("ModelGateway.generate (L1, PF1)", () => {
  it("AC-G6 引用必為 context 子集", async () => {
    const result = await gateway().generate({ question: "問題", context: CONTEXT }, CID);
    expect(result.citations.map((c) => c.chunkId)).toEqual(["doc-1#0"]);
  });

  it("AC-G7 空 context 是 422,不得用參數知識作答", async () => {
    await expect(
      gateway().generate({ question: "問題", context: [] }, CID),
    ).rejects.toBeInstanceOf(GenerationNoContextError);
  });

  it("AC-G8 空 question 是 validation error", async () => {
    await expect(
      gateway().generate({ question: "   ", context: CONTEXT }, CID),
    ).rejects.toBeInstanceOf(ModelGatewayValidationError);
  });

  it("AC-G9 ★ provider 捏造引用時整個回應被拒,不是濾掉那一筆", async () => {
    const rogue: GenerationProvider = {
      name: "fake",
      model: "rogue",
      fidelityCeiling: "PF1",
      async generate() {
        return {
          answer: "捏造的回答",
          citations: [
            { chunkId: "doc-1#0", documentId: "doc-1", startOffset: 0, endOffset: 12 },
            { chunkId: "does-not-exist#0", documentId: "nope", startOffset: 0, endOffset: 1 },
          ],
          model: "rogue",
        };
      },
    };
    await expect(
      gateway({ generation: rogue }).generate({ question: "問題", context: CONTEXT }, CID),
    ).rejects.toBeInstanceOf(FabricatedCitationError);
  });

  it("AC-G10 provider 失敗映射為 GenerationUnavailableError", async () => {
    const broken: GenerationProvider = {
      name: "fake",
      model: "broken",
      fidelityCeiling: "PF1",
      async generate(): Promise<never> {
        throw new Error("upstream exploded");
      },
    };
    await expect(
      gateway({ generation: broken }).generate({ question: "問題", context: CONTEXT }, CID),
    ).rejects.toBeInstanceOf(GenerationUnavailableError);
  });
});
