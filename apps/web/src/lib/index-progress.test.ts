import { describe, expect, it } from "vitest";
import { simulateIndexStep } from "./index-progress";

describe("simulateIndexStep (E05-S019)", () => {
  it("resolves immediately when delayMs is 0", async () => {
    const start = Date.now();
    await simulateIndexStep(0);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("defaults to a non-zero delay", async () => {
    const start = Date.now();
    await simulateIndexStep();
    // 500ms default; asserting 400ms leaves margin for timing jitter
    // while still ruling out an effectively-instant default — same
    // reasoning upload-progress.test.ts/parse-progress.test.ts's own
    // margin already uses.
    expect(Date.now() - start).toBeGreaterThanOrEqual(400);
  });
});
