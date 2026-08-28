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
});
