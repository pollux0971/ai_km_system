/**
 * E01-S026: inline JSX ports of the static SVGs under
 * `public/illustrations/empty/*.svg` — same pattern E03-S042's
 * VoiceVisualizer already established (a static file for the asset
 * inventory + svgo lint + design docs, an inline copy for actual
 * runtime rendering, since no SVGR loader is configured in
 * `next.config.ts` to import `.svg` files directly as components).
 * Keep the two in sync by hand when either changes.
 *
 * `currentColor` for line art lets the illustration recolor with
 * surrounding text color; the backdrop circle reads
 * `var(--md-sys-color-surface-container, var(--surface-2, #e3e2e6))` —
 * tries E01-S021's real M3 token first (once that story lands), else
 * falls back to the *existing* `--surface-2` token from globals.css
 * (already dark-mode-aware today via its own `prefers-color-scheme`
 * block), else a literal light-gray as the last-resort safety net. The
 * two-hop fallback matters: a bare literal here looked fine in light
 * mode but was nearly invisible in dark mode (light `currentColor` line
 * art on a light-gray circle) — caught via a real Playwright dark-mode
 * screenshot, not by inspection.
 */
export function NoConversationsIllustration() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 160 120" data-testid="illustration-no-conversations">
      <circle cx="80" cy="60" r="48" fill="var(--md-sys-color-surface-container, var(--surface-2, #e3e2e6))" />
      <rect width="64" height="40" x="44" y="38" fill="none" stroke="currentColor" strokeWidth="3" rx="10" />
      <path fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="3" d="M60 78v12l14-12Z" />
      <circle cx="64" cy="58" r="3" fill="currentColor" />
      <circle cx="76" cy="58" r="3" fill="currentColor" />
      <circle cx="88" cy="58" r="3" fill="currentColor" />
      <circle cx="112" cy="34" r="5" fill="currentColor" />
      <circle cx="128" cy="46" r="4" fill="currentColor" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="m112 34 16 12" />
    </svg>
  );
}

export function NoDocumentsIllustration() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 160 120" data-testid="illustration-no-documents">
      <circle cx="80" cy="60" r="48" fill="var(--md-sys-color-surface-container, var(--surface-2, #e3e2e6))" />
      <path fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="3" d="M54 30h34l16 16v44a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4V34a4 4 0 0 1 4-4Z" />
      <path fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="3" d="M88 30v16h16" />
      <path stroke="currentColor" strokeDasharray="4 5" strokeLinecap="round" strokeWidth="2.5" d="M58 60h36M58 72h36M58 84h22" />
      <circle cx="114" cy="88" r="12" fill="none" stroke="currentColor" strokeWidth="3" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="3" d="M114 82v12m-6-6h12" />
    </svg>
  );
}

export function NoResultsIllustration() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 160 120" data-testid="illustration-no-results">
      <circle cx="80" cy="60" r="48" fill="var(--md-sys-color-surface-container, var(--surface-2, #e3e2e6))" />
      <circle cx="72" cy="52" r="22" fill="none" stroke="currentColor" strokeWidth="3" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="4" d="m88 68 18 18" />
      <path stroke="currentColor" strokeDasharray="3 5" strokeLinecap="round" strokeWidth="2.5" d="M64 52h16" />
    </svg>
  );
}
