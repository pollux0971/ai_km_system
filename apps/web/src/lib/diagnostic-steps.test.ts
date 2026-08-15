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
