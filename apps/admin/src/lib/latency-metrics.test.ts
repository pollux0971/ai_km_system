import { describe, expect, it } from "vitest";
import { getLatencyMetrics } from "./latency-metrics";

describe("getLatencyMetrics (E13-S013)", () => {
  it("returns a null averageLatencyMs — no real cross-app data pipeline exists yet (apps/web's own usage-events.ts is unreachable from apps/admin)", async () => {
    const result = await getLatencyMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ averageLatencyMs: null });
  });
});
