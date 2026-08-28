import type { CSSProperties } from "react";

/**
 * E01-S022 (ADR 0006): Material Symbols Outlined, self-hosted as a variable font
 * (see apps/web/src/app/layout.tsx / fonts/LICENSES.md) and rendered via ligature —
 * the element's text content IS the icon's name (e.g. "mic"), which the font
 * substitutes for the glyph. `name` is typed as a plain `string`, not an enum of the
 * thousands of available icons (spec's explicit Non-Goal); nothing here validates it
 * against Material Symbols' name list — an unknown name just renders its own text.
 */
export interface IconProps {
  /** The Material Symbols icon name, e.g. "mic", "search", "close". */
  name: string;
  /** M3's 24dp baseline is the default. Also drives the `opsz` (optical size) axis. */
  size?: number;
  /** Toggles the `FILL` variation axis (1 = filled, 0 = outlined, the font's default). */
  filled?: boolean;
  /** When given, the icon is exposed to assistive tech (`role="img"` + this label) instead of being hidden. */
  label?: string;
}

const DEFAULT_SIZE = 24;
/** Material Symbols' `opsz` axis range — sizes outside this are clamped, not extrapolated. */
const MIN_OPTICAL_SIZE = 20;
const MAX_OPTICAL_SIZE = 48;

export function Icon({ name, size = DEFAULT_SIZE, filled = false, label }: IconProps) {
  const opticalSize = Math.min(MAX_OPTICAL_SIZE, Math.max(MIN_OPTICAL_SIZE, size));
  const style: CSSProperties = {
    fontFamily: "var(--font-material-symbols)",
    fontWeight: 400,
    fontStyle: "normal",
    fontSize: size,
    lineHeight: 1,
    display: "inline-block",
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${opticalSize}`,
  };

  return (
    <span className="md-icon" style={style} aria-hidden={!label} role={label ? "img" : undefined} aria-label={label}>
      {name}
    </span>
  );
}
