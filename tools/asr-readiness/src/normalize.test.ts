import { describe, expect, it } from "vitest";
import { isTraditionalOnly, keywordHitRate, toTraditional } from "./normalize.js";

describe("toTraditional", () => {
  it("converts Simplified to Taiwan-Traditional", () => {
    expect(toTraditional("这是软件测试")).toBe("這是軟體測試");
  });
});

describe("isTraditionalOnly", () => {
  it("is true for already-traditional text (round-trip no-op)", () => {
    expect(isTraditionalOnly("這是軟體測試")).toBe(true);
  });

  it("is false for text containing simplified characters", () => {
    expect(isTraditionalOnly("这是软件测试")).toBe(false);
  });

  it("is true for English/digits only (no CJK to convert)", () => {
    expect(isTraditionalOnly("API test 204")).toBe(true);
  });

  it("is false for a mix of traditional and simplified characters", () => {
    expect(isTraditionalOnly("這是软件")).toBe(false);
  });
});

describe("keywordHitRate", () => {
  it("is 1.0 when every keyword is present", () => {
    expect(keywordHitRate("明天的 deadline 確認一下", ["明天", "deadline", "確認"])).toBe(1);
  });

  it("is 0 when no keyword is present", () => {
    expect(keywordHitRate("完全不相關的句子", ["明天", "deadline"])).toBe(0);
  });

  it("computes a fractional hit rate", () => {
    expect(keywordHitRate("明天要開會", ["明天", "deadline", "確認"])).toBeCloseTo(1 / 3);
  });

  it("is vacuously 1.0 for an empty keyword list", () => {
    expect(keywordHitRate("任何文字", [])).toBe(1);
  });

  it("matches substrings, not whole-word only", () => {
    expect(keywordHitRate("這個deadline很趕", ["deadline"])).toBe(1);
  });

  // E12-S030 L3, 2026-09-04: the user's real recording transcribed as
  // "請幫我確認一下這個API的Error Code,然後把Deadline更新到系統裡。謝謝。"
  // — every one of expected.json's five keywords was recognised, yet
  // verify-asr scored 60% and failed, because whisper capitalises English
  // technical terms and this comparison was case-sensitive. The check claims
  // to measure "was the keyword recognised"; it was measuring "was it
  // recognised AND capitalised the same way". Case is not part of what the
  // AC asks about, so it is folded away — for the ASCII side only.
  it("matches an English keyword regardless of the case ASR happened to produce", () => {
    expect(
      keywordHitRate(
        "請幫我確認一下這個API的Error Code,然後把Deadline更新到系統裡。謝謝。",
        ["確認", "API", "error code", "deadline", "系統"],
      ),
    ).toBe(1);
  });

  it("still distinguishes different words, not merely different cases", () => {
    expect(keywordHitRate("這裡只有 Deadline", ["deadline", "headline"])).toBe(0.5);
  });

  // Case folding must not disturb the Chinese side: toLowerCase() is a no-op
  // for Han characters, and a keyword that is genuinely absent stays absent.
  it("does not turn an absent Chinese keyword into a hit", () => {
    expect(keywordHitRate("請幫我確認一下這個API", ["確認", "系統"])).toBe(0.5);
  });
});
