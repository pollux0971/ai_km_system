import { describe, expect, it } from "vitest";
import { simulateErpExportProgress } from "./erp-export-progress";

describe("simulateErpExportProgress (E09-S017)", () => {
  it("resolves immediately when delayMs is 0", async () => {
    const start = Date.now();
    await simulateErpExportProgress(0);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("defaults to a non-zero delay", async () => {
    const start = Date.now();
    await simulateErpExportProgress();
    // 500ms default; asserting 400ms leaves margin for timing jitter
    // while still ruling out an effectively-instant default — same
    // margin erp-execution.test.ts's own equivalent assertion uses.
    expect(Date.now() - start).toBeGreaterThanOrEqual(400);
  });
});
