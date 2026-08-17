import { describe, expect, it } from "vitest";
import { getSystemHealth } from "./system-health";

describe("getSystemHealth (E11-S022)", () => {
  it("returns every monitored subsystem with an honest 'unknown' status — no real health-check capability exists yet (E10-S04/E12-S005, Team B)", async () => {
    const result = await getSystemHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { id: "connectors", name: "連接器", status: "unknown" },
      { id: "models", name: "模型服務", status: "unknown" },
    ]);
  });
});
