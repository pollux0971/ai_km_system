import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, relativeLuminance } from "./contrast";

describe("hexToRgb", () => {
  it("parses a 6-digit hex color with #", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("parses a 6-digit hex color without #", () => {
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("throws on an invalid hex string", () => {
    expect(() => hexToRgb("#zzzzzz")).toThrow();
    expect(() => hexToRgb("#fff")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black vs white (WCAG max)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("is 1 for a color against itself (WCAG min)", () => {
    expect(contrastRatio("#1e56a0", "#1e56a0")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    const a = contrastRatio("#1e56a0", "#ffffff");
    const b = contrastRatio("#ffffff", "#1e56a0");
    expect(a).toBeCloseTo(b, 10);
  });

  it("matches a known reference pair (#767676 vs white ~= 4.54, the classic WCAG AA boundary example)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
});
