import { describe, expect, it } from "vitest";
import { ERP_PREDICTION_HORIZONS } from "./erp-prediction-horizons";

describe("ERP_PREDICTION_HORIZONS (E09-S018)", () => {
  it("is a non-empty, fixed list of prediction horizons with unique ids", () => {
    expect(ERP_PREDICTION_HORIZONS.length).toBeGreaterThan(0);
    const ids = ERP_PREDICTION_HORIZONS.map((horizon) => horizon.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const horizon of ERP_PREDICTION_HORIZONS) {
      expect(horizon.label).toBeTruthy();
    }
  });
});
