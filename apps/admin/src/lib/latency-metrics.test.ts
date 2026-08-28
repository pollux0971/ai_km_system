import { describe, expect, it } from "vitest";
import { getLatencyMetrics } from "./latency-metrics";
import { failNextRequest, setLatencyMetrics } from "@/test/fake-api";

describe("getLatencyMetrics (E13-S013, E13-S021 real API)", () => {
  it("AC3: returns null with zero samples — the honest starting point, not a fabricated placeholder", async () => {
    const result = await getLatencyMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ averageLatencyMs: null, sampleCount: 0 });
  });

  it("AC3: returns the real recorded average and sample count", async () => {
    setLatencyMetrics({ averageLatencyMs: 1320.5, sampleCount: 84 });

    const result = await getLatencyMetrics();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ averageLatencyMs: 1320.5, sampleCount: 84 });
  });

  it("AC2: a 403 from the server surfaces as a PERMISSION_DENIED error", async () => {
    failNextRequest("latency", 403, "PERMISSION_DENIED");

    const result = await getLatencyMetrics();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});
