import { describe, expect, it } from "vitest";
import { getErpPrediction } from "./erp-predictions";
import { ERP_PREDICTION_HORIZONS } from "./erp-prediction-horizons";

describe("getErpPrediction (E09-S019)", () => {
  it("returns a predicted growth statement naming the scenario and the horizon", () => {
    const prediction = getErpPrediction("各分公司營收", "next-month");

    expect(prediction).toContain("各分公司營收");
    expect(prediction).toContain("下月");
    expect(prediction).toContain("%");
  });

  it("returns a different statement for a different scenario label, same horizon", () => {
    const revenue = getErpPrediction("各分公司營收", "next-month");
    const stock = getErpPrediction("低庫存品項", "next-month");

    expect(revenue).not.toBe(stock);
    expect(stock).toContain("低庫存品項");
  });

  it("returns an increasing growth rate for a longer horizon (next-year > next-quarter > next-month)", () => {
    const extractRate = (prediction: string) => Number(prediction.match(/(\d+)%/)?.[1]);

    const month = extractRate(getErpPrediction("各分公司營收", "next-month"));
    const quarter = extractRate(getErpPrediction("各分公司營收", "next-quarter"));
    const year = extractRate(getErpPrediction("各分公司營收", "next-year"));

    expect(month).toBeLessThan(quarter);
    expect(quarter).toBeLessThan(year);
  });

  // The relative-ordering test above would not catch every 3 rates
  // shifting together while preserving their relative order (e.g. 3/8/15
  // becoming 5/10/20) — pinning the exact expected string for each
  // horizon closes that gap directly, same "assert the literal value, not
  // just a structural property" discipline this codebase applies
  // elsewhere (e.g. S011's chart width test).
  it("returns the exact expected growth statement for each whitelisted horizon", () => {
    expect(getErpPrediction("各分公司營收", "next-month")).toBe("預測「各分公司營收」下月將較本期成長約 3%。");
    expect(getErpPrediction("各分公司營收", "next-quarter")).toBe("預測「各分公司營收」下季將較本期成長約 8%。");
    expect(getErpPrediction("各分公司營收", "next-year")).toBe("預測「各分公司營收」下年將較本期成長約 15%。");
  });

  it("covers every whitelisted prediction horizon without falling back", () => {
    for (const horizon of ERP_PREDICTION_HORIZONS) {
      const prediction = getErpPrediction("各分公司營收", horizon.id);
      expect(prediction).toContain(horizon.label);
      expect(prediction).toContain("%");
    }
  });

  it("returns a distinct fallback message (not a crash) for an unrecognized horizon id", () => {
    const prediction = getErpPrediction("各分公司營收", "not-a-real-horizon-id");

    expect(prediction).toContain("各分公司營收");
    expect(prediction).not.toContain("%");
  });
});
