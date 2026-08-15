import { describe, expect, it } from "vitest";
import { explainDiagnosticStep } from "./diagnostic-explanations";

describe("explainDiagnosticStep (E07-S014)", () => {
  it("resolves an honestly-labeled, simulated explanation for step 0", async () => {
    const result = await explainDiagnosticStep(0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("模擬說明");
  });

  it("resolves an honestly-labeled, simulated explanation for step 1", async () => {
    const result = await explainDiagnosticStep(1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("模擬說明");
  });

  it("fails with NOT_FOUND for a stepIndex with no defined explanation", async () => {
    const result = await explainDiagnosticStep(99);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
