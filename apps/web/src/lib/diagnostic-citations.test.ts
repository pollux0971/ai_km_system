import { describe, expect, it } from "vitest";
import { getDiagnosticStepCitation } from "./diagnostic-citations";

describe("getDiagnosticStepCitation (E07-S015)", () => {
  it("resolves an honestly-labeled SOP citation for step 0", async () => {
    const result = await getDiagnosticStepCitation(0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toContain("模擬 SOP");
    expect(result.value.snippet).toContain("模擬片段");
    expect(result.value.section).toBeTruthy();
  });

  it("resolves an honestly-labeled SOP citation for step 1", async () => {
    const result = await getDiagnosticStepCitation(1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toContain("模擬 SOP");
    expect(result.value.snippet).toContain("模擬片段");
  });

  it("fails with NOT_FOUND for a stepIndex with no defined citation", async () => {
    const result = await getDiagnosticStepCitation(99);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
