"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getCitationSource, type CitationSource } from "@/lib/citations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:citation-preview-drawer");

/**
 * E03-S014: citation preview drawer. SOURCE_BASELINE.md (line 1168-1174)
 * only names the three fields to show — File/Page/Snippet — nothing
 * about interaction (this epic file's expanded title, "Citation preview
 * drawer", is the source of "drawer" as the concrete UI pattern; no
 * modal/tooltip/inline-expand alternative is named anywhere).
 *
 * `citationId: string | null` (not a boolean "open" flag) doubles as
 * both "is the drawer open" and "which citation to show" — there is
 * only ever one drawer for the whole thread (owned by message-thread.tsx,
 * not per-message), so switching directly from one citation to another
 * without closing first just re-triggers the effect below and reloads
 * in place, which is the natural, unsurprising behavior for a single
 * shared preview panel.
 *
 * Non-modal by design: renders as a normal in-flow region (not a
 * focus-trapped overlay), since nothing in the spec asks for modal
 * behavior and building a real focus trap for an unspecified
 * requirement would be speculative scope the task doesn't call for.
 *
 * "Not found" renders through the existing shared `ErrorMessage`
 * component with `code: "NOT_FOUND"` (already mapped to a safe generic
 * message by @ai-km/ui/error-message.tsx) rather than a bespoke empty
 * state — a lookup-by-id that finds nothing is closer to this
 * codebase's existing NOT_FOUND convention (see lib/messages.ts's
 * sendMessage/receiveAssistantReply) than to an EmptyState's "the
 * collection is legitimately empty" meaning. A more specific override
 * message is passed for NOT_FOUND specifically (same "context-specific
 * wording for the same code" pattern ErrorMessage's own doc comment
 * describes for login); any other/future error code falls back to the
 * shared component's own generic mapping rather than this component
 * inventing new copy for a case it doesn't know about.
 */
type LoadState = { kind: "loading" } | { kind: "error"; code: string } | { kind: "loaded"; source: CitationSource };

export function CitationPreviewDrawer({ citationId, onClose }: { citationId: string | null; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (citationId === null) return;

    let cancelled = false;
    setState({ kind: "loading" });
    const correlationId = crypto.randomUUID();
    logger.info("loading citation source", { correlationId, citationId });
    trackEvent("conversation_citation_preview_attempt", { correlationId, properties: { citationId } });

    getCitationSource(citationId).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load citation source", { correlationId, citationId, code: result.error.code });
        trackEvent("conversation_citation_preview_failure", { correlationId, properties: { citationId, code: result.error.code } });
        setState({ kind: "error", code: result.error.code });
        return;
      }

      logger.info("citation source loaded", { correlationId, citationId });
      trackEvent("conversation_citation_preview_success", { correlationId, properties: { citationId } });
      setState({ kind: "loaded", source: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [citationId]);

  if (citationId === null) return null;

  return (
    <div role="region" aria-label="引用來源預覽" style={{ marginTop: 16, border: "1px solid", padding: 12 }}>
      <div>
        <span>引用來源</span>
        <button type="button" onClick={onClose}>
          關閉
        </button>
      </div>
      {state.kind === "loading" && <LoadingIndicator />}
      {state.kind === "error" && (
        <ErrorMessage code={state.code} message={state.code === "NOT_FOUND" ? "找不到這個引用來源。" : undefined} />
      )}
      {state.kind === "loaded" && (
        <dl>
          <dt>檔案</dt>
          <dd>{state.source.file}</dd>
          <dt>頁碼</dt>
          <dd>{state.source.page}</dd>
          <dt>片段</dt>
          <dd>{state.source.snippet}</dd>
        </dl>
      )}
    </div>
  );
}
