import { describe, expect, it } from "vitest";
import { GENERATION_PHASES, GENERATION_PHASE_LABELS, runGenerationPhases } from "./generation-status";

describe("GENERATION_PHASES (E03-S011)", () => {
  it("is exactly Searching, Reading, Generating in that order, per SOURCE_BASELINE", () => {
    expect(GENERATION_PHASES).toEqual(["searching", "reading", "generating"]);
  });

  it("every phase has a Traditional Chinese display label", () => {
    for (const phase of GENERATION_PHASES) {
      expect(GENERATION_PHASE_LABELS[phase]).toBeTruthy();
    }
  });
});

describe("runGenerationPhases (E03-S011)", () => {
  it("yields exactly the three phases, in order", async () => {
    const phases: string[] = [];
    for await (const phase of runGenerationPhases(0)) {
      phases.push(phase);
    }

    expect(phases).toEqual(["searching", "reading", "generating"]);
  });

  it("defaults to a non-zero delay between phases", async () => {
    const start = Date.now();
    for await (const _phase of runGenerationPhases()) {
      // consume all three phases at the default pacing
    }
    const elapsed = Date.now() - start;

    // 3 phases means 3 delays are awaited (a trailing pause follows
    // "generating" too, not just the phases between) — at the default
    // 600ms pacing that's a 1800ms theoretical minimum; asserting
    // 1500ms leaves margin for timing jitter while still ruling out an
    // effectively-instant default.
    expect(elapsed).toBeGreaterThanOrEqual(1500);
  });
});
