import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getAppliedFilterLabel } from "./erp-applied-filters";

describe("getAppliedFilterLabel (E09-S012)", () => {
  it("lists the scenario's own keyword(s) that actually appear in the question text", () => {
    const label = getAppliedFilterLabel("revenue-by-branch", "上個月各分公司的營收總額是多少?");

    expect(label).toContain("營收");
    expect(label).toContain("分公司");
  });

  it("lists only the matched keyword when just one of the scenario's keywords appears", () => {
    const label = getAppliedFilterLabel("low-stock-items", "目前庫存低於安全存量的品項有哪些?");

    expect(label).toContain("庫存");
  });

  it("returns a distinct, honest label when none of the scenario's own keywords appear in the question", () => {
    // e.g. a scenario picked manually from S004's ambiguous fallback list —
    // no real keyword match drove this choice.
    const label = getAppliedFilterLabel("purchase-order-status", "隨便選一個好了");

    expect(label).toBeTruthy();
    expect(label).not.toContain("採購單");
    expect(label).not.toContain("訂購");
    expect(label).not.toContain("到貨");
  });

  it("returns a non-empty label for every whitelisted scenario, matched or not", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      expect(getAppliedFilterLabel(scenario.id, "任意問題文字")).toBeTruthy();
    }
  });

  it("returns a generic fallback label (not a crash) for an unrecognized scenario id", () => {
    const label = getAppliedFilterLabel("not-a-real-scenario-id", "任意問題");

    expect(label).toBeTruthy();
  });

  it("is stable across repeated calls with the same arguments", () => {
    const first = getAppliedFilterLabel("revenue-by-branch", "上個月各分公司的營收總額是多少?");
    const second = getAppliedFilterLabel("revenue-by-branch", "上個月各分公司的營收總額是多少?");

    expect(first).toBe(second);
  });
});
