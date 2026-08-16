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
