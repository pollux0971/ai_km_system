import { describe, expect, it } from "vitest";
import { createDeterministicEmbeddingProvider, tokenise, fnv1a } from "./deterministic.provider.js";

/**
 * Relocated with `deterministic.provider.ts` (E12-S032). The skeleton's
 * `dot()` lived in its own `embedding/provider.ts` and returned a
 * `Float32Array`-typed dot product; this package's `embed()` returns
 * `number[]` instead (see `EmbedResult`), so the same arithmetic is
 * reproduced here rather than imported across packages.
 */
function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量維度不符:${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
}

const CID = "test-correlation-id";
const EMBED_OPTS = { timeoutMs: 1000, correlationId: CID };

describe("DeterministicEmbeddingProvider", () => {
  it("PF0 相同輸入必須產生相同向量——否則儲存的與查詢的會靜默不一致", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const { vectors: [a] } = await p.embed({ texts: ["軸承過熱"], ...EMBED_OPTS });
    const { vectors: [b] } = await p.embed({ texts: ["軸承過熱"], ...EMBED_OPTS });
    expect(a).toEqual(b);
  });

  it("PF0 向量必須為單位長度,否則點積不等於餘弦相似度", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const { vectors: [v] } = await p.embed({ texts: ["潤滑油更換週期"], ...EMBED_OPTS });
    expect(dot(v!, v!)).toBeCloseTo(1, 5);
  });

  it("PF0 詞彙重疊高者相似度較高", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 512 });
    const { vectors: [q, near, far] } = await p.embed({
      texts: [
        "軸承溫度過高應立即停機",
        "軸承溫度超過八十度視為異常",
        "年度預算應於十月底前提出",
      ],
      ...EMBED_OPTS,
    });
    expect(dot(q!, near!)).toBeGreaterThan(dot(q!, far!));
  });

  it("PF0 批次順序必須與輸入順序一致", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const texts = ["甲", "乙", "丙"];
    const { vectors: batch } = await p.embed({ texts, ...EMBED_OPTS });
    for (const [i, t] of texts.entries()) {
      const { vectors: [single] } = await p.embed({ texts: [t], ...EMBED_OPTS });
      expect(batch[i]).toEqual(single);
    }
  });

  it("PF0 中日韓文字以雙字元切分,拉丁文以詞切分", () => {
    expect(tokenise("軸承過熱")).toEqual(["軸承", "承過", "過熱"]);
    expect(tokenise("Motor Overheating")).toEqual(["motor", "overheating"]);
  });

  it("PF0 雜湊必須跨執行穩定", () => {
    expect(fnv1a("軸承")).toBe(fnv1a("軸承"));
    expect(fnv1a("軸承")).not.toBe(fnv1a("預算"));
  });

  it("PF0 宣告的證據上限是 PF1,不得被誤用於語意宣稱", () => {
    const p = createDeterministicEmbeddingProvider();
    expect(p.fidelityCeiling).toBe("PF1");
  });
});
