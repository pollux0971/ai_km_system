import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCss, getSchemeHexMap, SEED_COLOR } from "./generate-m3-theme";
import { M3_COLOR_ROLES, M3_CONTRAST_PAIRS, cssVarForRole } from "../src/m3-roles";
import { contrastRatio } from "../src/contrast";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED_CSS_PATH = path.resolve(__dirname, "../src/m3-theme.css");

describe("SEED_COLOR", () => {
  it("is the user-confirmed brand blue", () => {
    expect(SEED_COLOR).toBe("#1e56a0");
  });
});

describe("generateCss — Functional AC 1 (complete light/dark role sets)", () => {
  const css = generateCss();
  const [lightBlock, darkBlock] = css.split("@media (prefers-color-scheme: dark)");

  it.each(M3_COLOR_ROLES)("light scheme defines %s", (role) => {
    expect(lightBlock).toContain(`${cssVarForRole(role)}:`);
  });

  it.each(M3_COLOR_ROLES)("dark scheme defines %s", (role) => {
    expect(darkBlock).toContain(`${cssVarForRole(role)}:`);
  });

  it("emits exactly one hex value per role per scheme (no duplicates/omissions)", () => {
    for (const block of [lightBlock, darkBlock]) {
      for (const role of M3_COLOR_ROLES) {
        const matches = block!.match(new RegExp(`${cssVarForRole(role)}:\\s*#[0-9a-f]{6};`, "g")) ?? [];
        expect(matches).toHaveLength(1);
      }
    }
  });

  it("committed src/m3-theme.css has no diff from a fresh generation (`check` gate)", () => {
    const committed = readFileSync(COMMITTED_CSS_PATH, "utf8");
    expect(committed).toBe(css);
  });
});

describe("getSchemeHexMap — Functional AC 6 (every role switches under prefers-color-scheme: dark)", () => {
  it("every M3 color role resolves to a different hex value between light and dark (except shadow/scrim, always black)", () => {
    const light = getSchemeHexMap(false);
    const dark = getSchemeHexMap(true);
    const alwaysBlack = new Set(["shadow", "scrim"]);
    for (const role of M3_COLOR_ROLES) {
      if (alwaysBlack.has(role)) continue;
      expect(light[role], `${role} should differ between light and dark`).not.toBe(dark[role]);
    }
  });

  it("shadow and scrim stay black in both schemes (M3 baseline invariant, not a bug)", () => {
    const light = getSchemeHexMap(false);
    const dark = getSchemeHexMap(true);
    expect(light.shadow).toBe("#000000");
    expect(dark.shadow).toBe("#000000");
    expect(light.scrim).toBe("#000000");
    expect(dark.scrim).toBe("#000000");
  });
});

describe("getSchemeHexMap — Functional AC 2 (on-X/X contrast >= 4.5:1)", () => {
  it.each([false, true])("all on-X/X pairs meet WCAG AA (small text) in isDark=%s", (isDark) => {
    const hexMap = getSchemeHexMap(isDark);
    for (const [onRole, role] of M3_CONTRAST_PAIRS) {
      const ratio = contrastRatio(hexMap[onRole], hexMap[role]);
      expect(ratio, `${onRole} vs ${role} (isDark=${isDark})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
