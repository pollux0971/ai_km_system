import { describe, expect, it } from "vitest";
import { getCurrentDiagnosticStep } from "./diagnostic-steps";

describe("getCurrentDiagnosticStep (E07-S007)", () => {
  it("returns a real, non-empty first step", () => {
    const step = getCurrentDiagnosticStep();

    expect(step.stepIndex).toBe(0);
    expect(step.instruction).toBeTruthy();
  });

  it("is pure — repeated calls return equal content, with no hidden state advancing it", () => {
    const first = getCurrentDiagnosticStep();
    const second = getCurrentDiagnosticStep();

    expect(second).toEqual(first);
  });

  it("labels the instruction as simulated, same convention as answer-state.ts's own ANSWER_STATE_FALLBACK_CONTENT — an honest placeholder, not fabricated real SOP content", () => {
    const step = getCurrentDiagnosticStep();

    expect(step.instruction).toContain("模擬");
  });
});

describe("getCurrentDiagnosticStep(stepIndex) (E07-S008)", () => {
  it("step 0 offers exactly 2 generic, non-empty decision options", () => {
    const step = getCurrentDiagnosticStep(0);

    expect(step.options).toHaveLength(2);
    for (const option of step.options ?? []) {
      expect(option.id).toBeTruthy();
      expect(option.label).toBeTruthy();
    }
  });

  it("step 1 is a real, distinct step with no options of its own", () => {
    const step = getCurrentDiagnosticStep(1);

    expect(step.stepIndex).toBe(1);
    expect(step.instruction).toBeTruthy();
    expect(step.instruction).not.toBe(getCurrentDiagnosticStep(0).instruction);
    expect(step.options ?? []).toHaveLength(0);
  });

  it("throws for an out-of-range step index instead of silently returning undefined content", () => {
    expect(() => getCurrentDiagnosticStep(99)).toThrow();
  });
});
