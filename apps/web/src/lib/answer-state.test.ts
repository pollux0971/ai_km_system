import { afterEach, describe, expect, it, vi } from "vitest";
import { ANSWER_STATES, ANSWER_STATE_LABELS, MOCK_ANSWER_STATE_TRIGGERS, classifyAnswerState } from "./answer-state";

describe("classifyAnswerState (E03-S021)", () => {
  it("defaults to ANSWERED for a question with no trigger phrase", () => {
    expect(classifyAnswerState("保固期限是多久？")).toBe("ANSWERED");
  });

  it("defaults to ANSWERED for an empty question", () => {
    expect(classifyAnswerState("")).toBe("ANSWERED");
  });

  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED"))("classifies %s from its trigger phrase", (state) => {
    const trigger = MOCK_ANSWER_STATE_TRIGGERS[state];
    expect(trigger).toBeDefined();
    if (!trigger) return;
    expect(classifyAnswerState(trigger)).toBe(state);
  });

  it("matches a trigger phrase embedded within a longer question, not just an exact match", () => {
    const trigger = MOCK_ANSWER_STATE_TRIGGERS.NO_EVIDENCE;
    expect(trigger).toBeDefined();
    if (!trigger) return;
    expect(classifyAnswerState(`保固期限是多久？ ${trigger}`)).toBe("NO_EVIDENCE");
  });

  it("every AnswerState has a Chinese label", () => {
    for (const state of ANSWER_STATES) {
      expect(ANSWER_STATE_LABELS[state]).toBeTruthy();
    }
  });
});

// E03-S045 (AC1): the "mock_triggers" flag gates every trigger phrase —
// this codebase's own vitest.setup.ts sets it to "true" globally, so
// these tests locally override it to exercise the flag-OFF default.
describe("classifyAnswerState respects the mock_triggers flag (E03-S045)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED"))(
    "ignores the %s trigger phrase and stays ANSWERED when mock_triggers is disabled",
    (state) => {
      vi.stubEnv("NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS", "false");
      const trigger = MOCK_ANSWER_STATE_TRIGGERS[state];
      expect(trigger).toBeDefined();
      if (!trigger) return;
      expect(classifyAnswerState(trigger)).toBe("ANSWERED");
    },
  );
});
