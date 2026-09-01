import { describe, expect, it } from "vitest";
import { createDeterministicEmbeddingProvider, tokenise, fnv1a } from "./deterministic.provider.js";
import { dot } from "./provider.js";

describe("DeterministicEmbeddingProvider", () => {
  it("PF0 相同輸入必須產生相同向量——否則儲存的與查詢的會靜默不一致", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const [a] = await p.embed(["軸承過熱"]);
    const [b] = await p.embed(["軸承過熱"]);
    expect(Array.from(a!)).toEqual(Array.from(b!));
  });

  it("PF0 向量必須為單位長度,否則點積不等於餘弦相似度", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const [v] = await p.embed(["潤滑油更換週期"]);
    expect(dot(v!, v!)).toBeCloseTo(1, 5);
  });

  it("PF0 詞彙重疊高者相似度較高", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 512 });
    const [q, near, far] = await p.embed([
      "軸承溫度過高應立即停機",
      "軸承溫度超過八十度視為異常",
      "年度預算應於十月底前提出",
    ]);
    expect(dot(q!, near!)).toBeGreaterThan(dot(q!, far!));
  });

  it("PF0 批次順序必須與輸入順序一致", async () => {
    const p = createDeterministicEmbeddingProvider({ dimensions: 64 });
    const texts = ["甲", "乙", "丙"];
    const batch = await p.embed(texts);
    for (const [i, t] of texts.entries()) {
      const [single] = await p.embed([t]);
      expect(Array.from(batch[i]!)).toEqual(Array.from(single!));
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
