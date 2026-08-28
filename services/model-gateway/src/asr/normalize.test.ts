import { describe, expect, it } from "vitest";
import { normalizeTranscript } from "./normalize.js";

describe("normalizeTranscript", () => {
  it("AC5: converts Simplified to Taiwan-Traditional, keeps English/digits", () => {
    expect(normalizeTranscript("这是软件测试 API test")).toBe("這是軟體測試 API test");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeTranscript("")).toBe("");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeTranscript("  你好世界  ")).toBe("你好世界");
  });

  it("collapses whitespace between two CJK characters", () => {
    expect(normalizeTranscript("你好 世界")).toBe("你好世界");
  });

  it("keeps a single space between CJK and Latin/digits", () => {
    // opencc-js's "twp" (Taiwan phrase conversion, per spec's explicit
    // Converter({from:"cn",to:"twp"}) — also what AC5's own 軟體 case
    // requires) converts the IT term 代碼→程式碼; this is the real,
    // verified output, not a typo — see EVIDENCE for how this was checked
    // against the contract's (stale, "tw" not "twp") illustrative example.
    expect(normalizeTranscript("查一下 E-204 的錯誤代碼")).toBe("查一下 E-204 的錯誤程式碼");
  });

  it("removes a whole-string hallucination artifact (謝謝觀看)", () => {
    expect(normalizeTranscript("谢谢观看")).toBe("");
  });

  it("removes a whole-string hallucination artifact with trailing punctuation", () => {
    expect(normalizeTranscript("谢谢观看。")).toBe("");
  });

  it("does NOT strip a hallucination phrase that is only part of a real sentence", () => {
    const result = normalizeTranscript("使用者說謝謝觀看這部影片後就離開了");
    expect(result).not.toBe("");
    expect(result).toContain("謝謝觀看");
  });
});
