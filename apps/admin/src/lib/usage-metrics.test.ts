import { describe, expect, it } from "vitest";
import { getUsageMetrics } from "./usage-metrics";

describe("getUsageMetrics (E11-S021)", () => {
  it("returns zero counts — no real usage event pipeline exists yet (E13, Team A's own not-yet-reached epic)", async () => {
    const result = await getUsageMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ dailyActiveUsers: 0, questionsAsked: 0 });
  });
});
