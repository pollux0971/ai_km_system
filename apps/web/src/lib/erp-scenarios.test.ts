import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS, matchErpScenarios } from "./erp-scenarios";

describe("ERP_SCENARIO_OPTIONS (E09-S003)", () => {
  it("is a non-empty, fixed whitelist of scenarios with unique ids", () => {
    expect(ERP_SCENARIO_OPTIONS.length).toBeGreaterThan(0);
    const ids = ERP_SCENARIO_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of ERP_SCENARIO_OPTIONS) {
      expect(option.label).toBeTruthy();
      expect(option.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe("matchErpScenarios (E09-S003)", () => {
  it("returns the scenario(s) whose keywords appear in the question text", () => {
    const matches = matchErpScenarios("上個月各分公司的營收總額是多少?");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((option) => option.id === "revenue-by-branch")).toBe(true);
  });

  it("returns a different scenario for a differently-worded question", () => {
    const matches = matchErpScenarios("目前庫存低於安全存量的品項有哪些?");

    expect(matches.some((option) => option.id === "low-stock-items")).toBe(true);
    expect(matches.some((option) => option.id === "revenue-by-branch")).toBe(false);
  });

  it("falls back to every whitelisted scenario when nothing matches (never an empty list)", () => {
    const matches = matchErpScenarios("完全不相關的內容，不含任何關鍵字");

    expect(matches).toEqual(ERP_SCENARIO_OPTIONS);
  });
});
