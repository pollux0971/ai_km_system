import { describe, expect, it } from "vitest";
import { expandLigatures, joinTextItems, JOIN_RULES_VERSION, type JoinableTextItem } from "./join.js";

function item(partial: Partial<JoinableTextItem> & { str: string }): JoinableTextItem {
  return {
    hasEOL: false,
    x: 0,
    endX: 0,
    height: 12,
    ...partial,
  };
}

describe("joinTextItems", () => {
  it("hasEOL → 換行,而非空格", () => {
    const items = [item({ str: "Hello", hasEOL: true, x: 0, endX: 50 }), item({ str: "World", x: 0, endX: 50 })];
    expect(joinTextItems(items)).toBe("Hello\nWorld");
  });

  it("最後一個 item 若 hasEOL,結尾也要補換行", () => {
    const items = [item({ str: "end", hasEOL: true, x: 0, endX: 30 })];
    expect(joinTextItems(items)).toBe("end\n");
  });

  it("同一行、間距明顯大於字高門檻 → 插入空格", () => {
    const items = [
      item({ str: "Hello", x: 0, endX: 50, height: 12 }),
      // gap = 60 - 50 = 10 > 12 * 0.2 = 2.4 → 視為真正的字間距
      item({ str: "World", x: 60, endX: 100, height: 12 }),
    ];
    expect(joinTextItems(items)).toBe("Hello World");
  });

  it("同一行、間距小於字高門檻 → 不插入空格(同一個詞被字型/字距切成兩個 item)", () => {
    const items = [
      item({ str: "Hel", x: 0, endX: 20, height: 12 }),
      // gap = 21 - 20 = 1 < 12 * 0.2 = 2.4 → 視為同一個詞的延續
      item({ str: "lo", x: 21, endX: 35, height: 12 }),
    ];
    expect(joinTextItems(items)).toBe("Hello");
  });

  it("行尾連字號 + 下一行小寫開頭 → 視為斷字,移除連字號、不留換行", () => {
    const items = [
      item({ str: "effi-", hasEOL: true, x: 0, endX: 40 }),
      item({ str: "ciency", x: 0, endX: 60 }),
    ];
    expect(joinTextItems(items)).toBe("efficiency");
  });

  it("行尾連字號 + 下一行大寫開頭 → 不視為斷字,連字號與換行都保留", () => {
    const items = [
      item({ str: "info-", hasEOL: true, x: 0, endX: 40 }),
      item({ str: "Graphics", x: 0, endX: 60 }),
    ];
    expect(joinTextItems(items)).toBe("info-\nGraphics");
  });

  it("連字號前不是字母(例如數字或標點)→ 不觸發斷字判斷", () => {
    const items = [item({ str: "1-", hasEOL: true, x: 0, endX: 20 }), item({ str: "one", x: 0, endX: 30 })];
    expect(joinTextItems(items)).toBe("1-\none");
  });

  it("連字(ligature)fi 展開為 fi", () => {
    // U+FB01 LATIN SMALL LIGATURE FI
    expect(expandLigatures("ofﬁce")).toBe("office");
  });

  it("連字 fl／ffi／ffl 也一併展開", () => {
    expect(expandLigatures("ﬂuid")).toBe("fluid");
    expect(expandLigatures("staﬃng")).toBe("staffing");
    expect(expandLigatures("scuﬄe")).toBe("scuffle");
  });

  it("透過 joinTextItems 串接時連字也要展開", () => {
    const items = [item({ str: "ofﬁce", x: 0, endX: 30 })];
    expect(joinTextItems(items)).toBe("office");
  });

  it("空陣列回傳空字串", () => {
    expect(joinTextItems([])).toBe("");
  });

  it("JOIN_RULES_VERSION 是穩定、可比對的整數——version bump 才會變動", () => {
    expect(JOIN_RULES_VERSION).toBe(1);
    expect(Number.isInteger(JOIN_RULES_VERSION)).toBe(true);
  });
});
