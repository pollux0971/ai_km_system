/**
 * `sigmoid()` (E04-S089) — the raw-logit-to-[0,1] mapping `models/rerank/
 * README.md` §④ concluded this reranker's endpoint needs. Pure function,
 * tested in isolation from any HTTP concern (that's `cross-encoder-http.
 * provider.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { sigmoid } from "./cross-encoder.js";

describe("sigmoid", () => {
  it("maps 0 to exactly 0.5", () => {
    expect(sigmoid(0)).toBe(0.5);
  });

  it("maps the measured real-server logits (models/rerank/README.md §②/§⑤) into (0, 1), preserving their order", () => {
    // README's own measured values: relevant passages score 6.48 / -0.01,
    // irrelevant ones score ~-11.02. A sigmoid must keep that ordering while
    // squashing everything into the open interval (0, 1).
    const relevantSameLanguage = sigmoid(6.482923984527588);
    const relevantCrossLanguage = sigmoid(-0.01437273621559143);
    const irrelevant = sigmoid(-11.01986312866211);

    for (const v of [relevantSameLanguage, relevantCrossLanguage, irrelevant]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
    expect(relevantSameLanguage).toBeGreaterThan(relevantCrossLanguage);
    expect(relevantCrossLanguage).toBeGreaterThan(irrelevant);
    // Concretely: the near-zero cross-language pair should sit close to 0.5,
    // not be crushed toward 0 the way the clearly-irrelevant pair is.
    expect(relevantCrossLanguage).toBeCloseTo(0.5, 1);
    expect(irrelevant).toBeLessThan(0.001);
    expect(relevantSameLanguage).toBeGreaterThan(0.998);
  });

  it("is symmetric around 0.5: sigmoid(-x) === 1 - sigmoid(x)", () => {
    expect(sigmoid(-3.2) + sigmoid(3.2)).toBeCloseTo(1, 10);
  });
});
