import { describe, expect, it } from "vitest";
import { getUsageMetrics } from "./usage-metrics";
import { failNextRequest, setUsageMetrics } from "@/test/fake-api";

describe("getUsageMetrics (E11-S021, E13-S021 real API)", () => {
  it("AC1: returns zero counts for a date with no recorded usage — the honest starting point, not a fabricated placeholder", async () => {
    const result = await getUsageMetrics("2026-08-29");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 });
  });

  it("AC1: returns the real recorded counts for a date that has data", async () => {
    setUsageMetrics("2026-08-28", { dailyActiveUsers: 2, questionsAsked: 5 });

    const result = await getUsageMetrics("2026-08-28");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ date: "2026-08-28", dailyActiveUsers: 2, questionsAsked: 5 });
  });

  it("passes the requested date through — a different date is unaffected by another date's data", async () => {
    setUsageMetrics("2026-08-28", { dailyActiveUsers: 2, questionsAsked: 5 });

    const result = await getUsageMetrics("2026-08-29");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 });
  });

  it("AC2: a 403 from the server surfaces as a PERMISSION_DENIED error", async () => {
    failNextRequest("usage", 403, "PERMISSION_DENIED");

    const result = await getUsageMetrics("2026-08-29");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});
