/** Placeholder token set — replace with the real design system once one exists. */

export const colors = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  primary: "#2563eb",
  danger: "#dc2626",
  /** E01-S011: skeleton/disabled-surface placeholder color. */
  muted: "#e5e5e5",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
} as const;

export { m3, typescale, shape, elevation, stateLayer, motion } from "./m3";
export type { TypescaleStyle, TypescaleKey } from "./m3";
export { M3_COLOR_ROLES, M3_CONTRAST_PAIRS, cssVarForRole } from "./m3-roles";
export type { M3ColorRole } from "./m3-roles";
export { contrastRatio, relativeLuminance, hexToRgb } from "./contrast";
