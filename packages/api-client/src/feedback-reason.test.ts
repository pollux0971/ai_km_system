import { describe, expect, it } from "vitest";
import { FEEDBACK_REASON_LABELS, FEEDBACK_REASONS, getFeedbackReasonLabel } from "./feedback-reason";

describe("getFeedbackReasonLabel (E01-S035)", () => {
  it("maps every known FeedbackReason code to its own Chinese label, not the raw code", () => {
    expect(getFeedbackReasonLabel("INCORRECT")).toBe("答案不正確");
    expect(getFeedbackReasonLabel("INCOMPLETE")).toBe("答案不完整");
    expect(getFeedbackReasonLabel("OFF_TOPIC")).toBe("答案離題");
    expect(getFeedbackReasonLabel("OTHER")).toBe("其他");
  });

  it("covers every code in FEEDBACK_REASONS — no code is silently left unmapped", () => {
    for (const code of FEEDBACK_REASONS) {
      expect(getFeedbackReasonLabel(code)).toBe(FEEDBACK_REASON_LABELS[code]);
      expect(getFeedbackReasonLabel(code)).not.toBe(code);
    }
  });

  it("falls back to the raw string for a value that isn't a known code (legacy free text)", () => {
    expect(getFeedbackReasonLabel("回答完全解決問題")).toBe("回答完全解決問題");
    expect(getFeedbackReasonLabel("SOME_FUTURE_CODE")).toBe("SOME_FUTURE_CODE");
  });
});
