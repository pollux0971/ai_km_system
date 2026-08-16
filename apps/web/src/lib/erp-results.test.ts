import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultSummary } from "./erp-results";

describe("getErpResultSummary (E09-S007)", () => {
  it("returns a non-empty summary for every whitelisted scenario", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      expect(getErpResultSummary(scenario.id)).toBeTruthy();
    }
  });

  it("returns a different summary for different scenarios", () => {
    const revenueSummary = getErpResultSummary("revenue-by-branch");
    const stockSummary = getErpResultSummary("low-stock-items");

    expect(revenueSummary).not.toBe(stockSummary);
  });

  it("returns a stable summary across repeated calls for the same scenario", () => {
    const first = getErpResultSummary("revenue-by-branch");
    const second = getErpResultSummary("revenue-by-branch");

    expect(first).toBe(second);
  });

  it("returns a generic fallback summary for an unrecognized scenario id", () => {
    const summary = getErpResultSummary("not-a-real-scenario-id");

    expect(summary).toBeTruthy();
  });
});
