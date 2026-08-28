import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { M3_COLOR_ROLES, cssVarForRole, elevation, m3, shape, stateLayer, typescale } from "@ai-km/design-tokens";

/**
 * E01-S021 Functional AC 3: existing `globals.css` variables must map onto
 * M3 roles (no hardcoded hex outside the generated m3-theme.css import),
 * and the hand-authored typescale/shape/elevation/state/motion variables
 * here must not drift from packages/design-tokens/src/m3.ts.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.resolve(__dirname, "./globals.css");
const css = readFileSync(CSS_PATH, "utf8");

/** Extracts every `--name: value;` custom property declaration in the file. */
function extractCssVars(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    result[`--${match[1]}`] = match[2]!.trim();
  }
  return result;
}

const cssVars = extractCssVars(css);

describe("globals.css — M3 import", () => {
  it("imports the generated m3-theme.css as the sole source of --md-sys-color-* values", () => {
    expect(css).toContain('@import "@ai-km/design-tokens/m3-theme.css";');
  });

  it("declares no hardcoded hex colors of its own (all colors come from imported M3 roles)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe("globals.css — legacy variables map onto M3 roles (Functional AC 3)", () => {
  const legacyToRole: Record<string, string> = {
    "--bg": "surface",
    "--surface": "surface-container-lowest",
    "--surface-2": "surface-container",
    "--text": "on-surface",
    "--text-muted": "on-surface-variant",
    "--border": "outline-variant",
    "--border-strong": "outline",
    "--primary": "primary",
    "--primary-soft": "primary-container",
    "--on-primary": "on-primary",
    "--danger": "error",
    "--danger-soft": "error-container",
    "--success": "tertiary",
    "--sidebar-bg": "surface-container-high",
    "--sidebar-text": "on-surface-variant",
    "--sidebar-text-strong": "on-surface",
    "--sidebar-active": "secondary-container",
    "--sidebar-active-text": "on-secondary-container",
    "--sidebar-border": "outline-variant",
  };

  it.each(Object.entries(legacyToRole))("%s maps to var(%s)", (legacyVar, role) => {
    expect(cssVars[legacyVar]).toBe(`var(${cssVarForRole(role as (typeof M3_COLOR_ROLES)[number])})`);
  });

  it("hover/pressed/focus variables derive from M3 roles via color-mix, not literal colors", () => {
    for (const v of ["--primary-hover", "--primary-active", "--sidebar-hover", "--ring"]) {
      expect(cssVars[v]).toContain("var(--md-sys-color-");
      expect(cssVars[v]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });
});

describe("globals.css — shape/elevation/state/motion match packages/design-tokens/src/m3.ts", () => {
  it.each(Object.entries(shape))("shape.%s", (key, value) => {
    const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    expect(cssVars[`--md-sys-shape-corner-${kebab}`]).toBe(value);
  });

  it.each(Object.entries(elevation))("elevation level %s", (level, value) => {
    expect(cssVars[`--md-sys-elevation-level${level}`]).toBe(value);
  });

  it.each(Object.entries(stateLayer))("stateLayer.%s", (key, value) => {
    expect(cssVars[`--md-sys-state-${key}-opacity`]).toBe(String(value));
  });

  it("motion easing and duration", () => {
    expect(cssVars["--md-sys-motion-easing-standard"]).toBe(m3.motion.easing.standard);
    expect(cssVars["--md-sys-motion-easing-emphasized"]).toBe(m3.motion.easing.emphasized);
    expect(cssVars["--md-sys-motion-duration-short"]).toBe(m3.motion.duration.short);
    expect(cssVars["--md-sys-motion-duration-medium"]).toBe(m3.motion.duration.medium);
    expect(cssVars["--md-sys-motion-duration-long"]).toBe(m3.motion.duration.long);
  });
});

describe("globals.css — type scale matches packages/design-tokens/src/m3.ts", () => {
  it.each(Object.entries(typescale))("typescale.%s", (key, style) => {
    const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    expect(cssVars[`--md-sys-typescale-${kebab}-size`]).toBe(style.fontSize);
    expect(cssVars[`--md-sys-typescale-${kebab}-line-height`]).toBe(style.lineHeight);
    expect(cssVars[`--md-sys-typescale-${kebab}-weight`]).toBe(String(style.fontWeight));
    expect(cssVars[`--md-sys-typescale-${kebab}-tracking`]).toBe(style.letterSpacing);
  });

  it("body uses the body-large typescale font stack", () => {
    expect(css).toContain("font-family: var(--md-sys-typescale-body-large-font);");
  });
});
