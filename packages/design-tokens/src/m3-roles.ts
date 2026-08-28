/**
 * M3 baseline color role list (spec 2021), kebab-case as used for CSS
 * custom property names (`--md-sys-color-<role>`). Excludes 2025-only
 * "fixed"/"dim" roles, which are out of scope for E01-S021.
 */
export const M3_COLOR_ROLES = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "error",
  "on-error",
  "error-container",
  "on-error-container",
  "background",
  "on-background",
  "surface",
  "on-surface",
  "surface-variant",
  "on-surface-variant",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "outline",
  "outline-variant",
  "shadow",
  "scrim",
  "inverse-surface",
  "inverse-on-surface",
  "inverse-primary",
  "surface-tint",
] as const;

export type M3ColorRole = (typeof M3_COLOR_ROLES)[number];

/**
 * `on-X` / `X` pairs whose WCAG contrast must be >= 4.5:1 (small text),
 * per E01-S021 Functional AC 2.
 */
export const M3_CONTRAST_PAIRS: readonly (readonly [onRole: M3ColorRole, role: M3ColorRole])[] = [
  ["on-primary", "primary"],
  ["on-primary-container", "primary-container"],
  ["on-secondary", "secondary"],
  ["on-secondary-container", "secondary-container"],
  ["on-tertiary", "tertiary"],
  ["on-tertiary-container", "tertiary-container"],
  ["on-error", "error"],
  ["on-error-container", "error-container"],
  ["on-surface", "surface"],
  ["on-surface-variant", "surface-variant"],
];

/** Converts a kebab-case role name to the camelCase getter name used by DynamicScheme. */
export function kebabToCamel(role: string): string {
  return role.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** CSS custom property name for a given M3 color role. */
export function cssVarForRole(role: M3ColorRole): string {
  return `--md-sys-color-${role}`;
}
