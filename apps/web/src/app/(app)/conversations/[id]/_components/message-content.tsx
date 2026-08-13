import { Fragment } from "react";

/**
 * E03-S013: citation badge rendering. SOURCE_BASELINE.md gives this
 * story only a title plus a two-line example (line 1160-1164):
 *
 *   E03-S13 Citation Badge
 *   例如：
 *   [1]
 *
 * — nothing else: no data shape for what a citation references, no
 * click/hover interaction. S13 itself therefore rendered the badge as
 * an inert, non-interactive marker; E03-S14 "Citation Preview" (see
 * citation-preview-drawer.tsx) is the story that adds the interaction —
 * a nested `<button>` inside the `<sup>` calling `onCitationClick`,
 * added once S14 actually had somewhere real to send that click (the
 * preview drawer), not invented speculatively back in S13.
 *
 * There is no real RAG/citation backend (E04 doesn't exist), so
 * lib/streaming.ts's mock reply is the only source of citation markers
 * — a literal `[1]`-style substring embedded directly in the mock
 * text, parsed here rather than carried as a separate structured field.
 * This is a deliberate simplification for a mock with no real source
 * metadata to attach (no filename/page/snippet exists to invent
 * without fabricating business content, the same discipline applied to
 * E03-S005 never inventing a real model vendor name) — a real
 * implementation backed by E04 would carry citations as structured
 * data with character offsets, not regex-parsed from plain text.
 *
 * Only ever applied to assistant replies (`withCitations` prop) — a
 * user's own typed message rendering "[1]" as a citation badge just
 * because it happens to contain that exact substring would be
 * surprising, unrequested behavior.
 *
 * Rendered as a plain `<sup>` with no explicit `role` — not
 * `role="doc-noteref"` (the DPUB-ARIA citation-reference role that
 * would otherwise be the textbook-correct choice). Chromium's
 * accessibility tree (verified directly: Playwright's aria snapshot of
 * an explicit `role="doc-noteref"` `<sup>` still reports it as
 * `superscript`, not `doc-noteref`) falls back silently to the host
 * element's own implicit role whenever it doesn't recognize a DPUB
 * role, rather than surfacing an error — so asserting on "doc-noteref"
 * would be untestable through this repo's real browser E2E tooling.
 * `<sup>` already carries a correct, standard implicit ARIA role of its
 * own ("superscript", per the ARIA-in-HTML mapping) that both jsdom
 * (unit tests) and Chromium (E2E) resolve consistently, so this leans
 * on that native semantic instead of fighting the tooling for a role it
 * won't reliably expose. `aria-label` still gives assistive tech the
 * fuller "引用來源 N" description regardless of which role wins.
 *
 * E03-S14 nests a `<button>` inside the `<sup>` rather than replacing
 * it — the `<sup>` keeps its S13 `aria-label` ("引用來源 N", describing
 * what the marker IS) completely unchanged, so every existing S13
 * assertion still holds; the new inner `<button>` carries its own,
 * differently-worded label ("檢視引用來源 N", describing the ACTION of
 * clicking it) and is the actual click target. Nesting an interactive
 * element inside `<sup>` is valid standard HTML (`<sup>` accepts any
 * phrasing content) and doesn't change `<sup>`'s own role computation.
 */
const CITATION_PATTERN = /(\[\d+\])/g;

export function MessageContent({
  content,
  withCitations,
  onCitationClick,
}: {
  content: string;
  withCitations: boolean;
  onCitationClick: (citationId: string) => void;
}) {
  if (!withCitations) {
    return <>{content}</>;
  }

  const parts = content.split(CITATION_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        if (!/^\[\d+\]$/.test(part)) {
          return <Fragment key={index}>{part}</Fragment>;
        }
        // Slicing off the surrounding brackets (not the capture group
        // from a .exec() match) keeps this a plain `string`, not
        // `string | undefined` — this repo's tsconfig has
        // noUncheckedIndexedAccess on, which types every regex capture
        // group access as possibly-undefined even though the .test()
        // above already guarantees `part` is exactly `[<digits>]`.
        const citationId = part.slice(1, -1);
        return (
          <sup key={index} aria-label={`引用來源 ${citationId}`}>
            <button type="button" aria-label={`檢視引用來源 ${citationId}`} onClick={() => onCitationClick(citationId)}>
              {part}
            </button>
          </sup>
        );
      })}
    </>
  );
}
