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
 * click/hover interaction. That's deliberately out of scope here:
 * E03-S14 "Citation Preview" is the separate, still-unbuilt story that
 * owns showing File/Page/Snippet detail for a citation (per its own
 * SOURCE_BASELINE entry immediately following S13's). A citation badge
 * here is therefore rendered as an inert, non-interactive marker — not
 * a button — so this story doesn't reach into S14's territory by
 * inventing a click handler with nowhere real to send it.
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
 */
const CITATION_PATTERN = /(\[\d+\])/g;

export function MessageContent({ content, withCitations }: { content: string; withCitations: boolean }) {
  if (!withCitations) {
    return <>{content}</>;
  }

  const parts = content.split(CITATION_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) {
          return <Fragment key={index}>{part}</Fragment>;
        }
        return (
          <sup key={index} aria-label={`引用來源 ${match[1]}`}>
            {part}
          </sup>
        );
      })}
    </>
  );
}
