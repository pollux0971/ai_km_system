"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-preview");

/**
 * E05-S022 "Document preview". Rendered by knowledge-document-list.tsx
 * per document, right after the existing size/time fields.
 *
 * Needs NO new fetch and NO new lib function — `content` is already
 * part of the KnowledgeBaseDocument object listKnowledgeBaseDocuments
 * already returned to the parent; this is a pure client-side reveal/
 * hide toggle over data already in hand, not a mutation or a new
 * network round trip. That is also why this story has no
 * attempt/success/failure telemetry triple the way every mutating
 * sibling widget on this page does — there is no operation here that
 * can fail; expanding a preview either shows the (already-known)
 * content or the (already-known) absence of it.
 *
 * A file-sourced (E05-S011-S013) or URL-sourced (E05-S014) document
 * has no `content` at all — see that field's own doc comment on
 * KnowledgeBaseDocument: no real file bytes are ever read/stored, and
 * no real fetch ever happens for a URL import. Faking preview text for
 * either would be exactly the "don't fake data you don't have"
 * violation this whole document-sources arc has consistently avoided
 * since S011. Only a text-input document (E05-S015) has real, honestly
 * stored `content` to show. The other two sources get an honest "此
 * 文件目前無法預覽。" message instead of a preview toggle that would
 * only ever reveal nothing.
 *
 * `aria-expanded` on the toggle button reflects state for screen
 * readers — a standard disclosure-widget pattern; the button's own
 * text also changes ("預覽"/"收合預覽"), so state is never conveyed by
 * appearance alone.
 *
 * Emits a `knowledge_base_document_preview_viewed` event on every
 * expand — not a full attempt/success/failure triple (per the "not a
 * mutation" reasoning above), and not suppressed after the first
 * expand either: same "fires every time it happens, not just once
 * ever" shape as this app's own page_view telemetry (E01-S019) —
 * collapsing and re-expanding is a genuine, separate view worth its
 * own record, not a duplicate to dedupe. Includes `documentId` and
 * whether it had content, but never the content itself or the
 * document's name, same "don't log free-form enterprise content"
 * restraint every sibling widget already follows.
 */
export default function KnowledgeDocumentPreview({
  knowledgeBaseId,
  documentId,
  content,
}: {
  knowledgeBaseId: string;
  documentId: string;
  content?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      logger.info("document preview expanded", { knowledgeBaseId, documentId, hasContent: content !== undefined });
      trackEvent("knowledge_base_document_preview_viewed", {
        properties: { knowledgeBaseId, documentId, hasContent: content !== undefined },
      });
    }
  }

  return (
    <>
      <button type="button" onClick={handleToggle} aria-expanded={expanded}>
        {expanded ? "收合預覽" : "預覽"}
      </button>
      {expanded && (
        <div style={{ marginTop: 4 }}>
          {content !== undefined ? <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre> : <p style={{ margin: 0 }}>此文件目前無法預覽。</p>}
        </div>
      )}
    </>
  );
}
