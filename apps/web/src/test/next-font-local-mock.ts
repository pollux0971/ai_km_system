/**
 * E01-S022: `next/font/local` only works inside Next's own build pipeline (its SWC/
 * webpack font loader rewrites the `localFont(...)` call at compile time) — imported
 * directly under vitest/jsdom it isn't a real function at all. Every real font's build
 * output (the actual `.woff2` self-hosting, the `--font-*` CSS variables, "no CDN
 * reference" AC1) is already verified by `pnpm --filter @ai-km/web build` + a grep on
 * that output (see archive/stories/E01-S022.md) — this mock only exists so
 * `apps/web/src/app/layout.tsx` (and anything else importing `next/font/local`) can be
 * imported at all under vitest, without needing to touch layout.test.tsx.
 */
export default function localFont(_options: unknown): { className: string; variable: string; style: Record<string, never> } {
  return { className: "", variable: "", style: {} };
}
