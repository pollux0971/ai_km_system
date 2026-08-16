import { describe, expect, it } from "vitest";
import { simulateErpQueryExecution } from "./erp-execution";

describe("simulateErpQueryExecution (E09-S006)", () => {
  it("resolves immediately when delayMs is 0", async () => {
    const start = Date.now();
    await simulateErpQueryExecution(0);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("defaults to a non-zero delay", async () => {
    const start = Date.now();
    await simulateErpQueryExecution();
    // 500ms default; asserting 400ms leaves margin for timing jitter
    // while still ruling out an effectively-instant default — same
    // reasoning index-progress.test.ts's own margin already uses.
    expect(Date.now() - start).toBeGreaterThanOrEqual(400);
  });
});
