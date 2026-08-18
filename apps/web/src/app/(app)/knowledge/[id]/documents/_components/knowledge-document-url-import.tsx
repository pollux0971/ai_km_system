"use client";

import { useId, useState, type FormEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { addKnowledgeBaseDocumentFromUrl } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-url-import");

/**
 * E05-S014 "URL import". A separate component from
 * KnowledgeDocumentUpload, not a third mode bolted onto it —
 * KnowledgeDocumentUpload's entire internal model is built around
 * `File[]` (selection, per-item removal, batch upload); URL import is
 * a single text field with an explicit submit, a fundamentally
 * different interaction shape, same reasoning MessageComposer's text
 * input and FileAttachmentPicker stay two separate components despite
 * being composed together on one page. Rendered alongside
 * KnowledgeDocumentUpload on the same /knowledge/[id]/documents page
 * (not a separate route) — same "add an item belongs on the page with
 * the list it adds to" reasoning as the upload widget itself.
 *
 * Submit-based (a text input + explicit 匯入 button), not instant-apply
 * — a URL is typed content the user composes and might want to review
 * before committing, closer to S08's draft-then-儲存 shape than S06/
 * S07/S09's instant-apply. On failure, the entered draft is kept (not
 * cleared) so the user doesn't have to retype it — same precedent as
 * S08's prompt editor and this route's own KnowledgeDocumentUpload
 * (failed files stay selected).
 *
 * No real fetch happens here — nothing crawls the URL or extracts
 * content from it; see addKnowledgeBaseDocumentFromUrl's own doc
 * comment for the full reasoning (E06-S18/S19, Team B, both `todo`).
 * The resulting document has no `sizeBytes` — there's nothing to
 * report a byte count for.
 *
 * Telemetry deliberately excludes the URL itself — even though a URL
 * is by definition a public web address (unlike a filename, which can
 * itself be sensitive), it can still carry sensitive query parameters
 * or reveal what internal content a user is researching; same "don't
 * log free-form user-entered content" restraint this route's sibling
 * components already apply to prompt text (S008) and file names
 * (S011). Functional AC 7 (audit event) is judged N/A for the same
 * reason as file uploads — importing a source is a content-creation
 * action, not an access-control change (S003 precedent).
 *
 * The input is `type="text"`, not `type="url"` — discovered mid-
 * development: `type="url"` triggers the browser's OWN native
 * constraint validation on submit, which silently blocks the `submit`
 * event (this component's `handleSubmit` never even runs) for a
 * syntactically-invalid value, bypassing addKnowledgeBaseDocumentFromUrl
 * and this component's own carefully-worded Chinese error messages
 * entirely in favor of the browser's un-styled, unlocalized native
 * validation bubble. `type="text"` keeps
 * addKnowledgeBaseDocumentFromUrl as the single source of truth for
 * what counts as a valid URL, consistent with how every other form in
 * this codebase validates in JS rather than relying on native HTML
 * constraints (e.g. renameConversation's trim-check).
 *
 * Shows `result.error.message` directly (not a fixed generic string
 * the way knowledge-model-editor.tsx's S009 VALIDATION_ERROR branch
 * does) — a deliberate departure, not an oversight. All four possible
 * messages addKnowledgeBaseDocumentFromUrl can return are this
 * codebase's own deliberately-authored, pre-translated UI copy (never
 * a raw caught exception or stack trace — the UX Acceptance concern
 * that rule guards against), and unlike S009's disabled-model case
 * (an edge case the UI's own `<option disabled>` already normally
 * prevents a user from reaching), URL validation failures ARE the
 * expected, routine way a user finds out their input needs fixing —
 * "請輸入有效的網址" is directly actionable in a way a generic "匯入
 * 失敗，請稍後再試" wouldn't be.
 */
export default function KnowledgeDocumentUrlImport({
  knowledgeBaseId,
  onImported,
}: {
  knowledgeBaseId: string;
  onImported: () => void;
}) {
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !url.trim()) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("importing document from URL", { correlationId, knowledgeBaseId });
    trackEvent("knowledge_base_document_url_import_attempt", { correlationId, properties: { knowledgeBaseId } });

    const result = await addKnowledgeBaseDocumentFromUrl(knowledgeBaseId, url);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to import document from URL", { correlationId, knowledgeBaseId, code: result.error.code });
      trackEvent("knowledge_base_document_url_import_failure", {
        correlationId,
        properties: { knowledgeBaseId, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    logger.info("document imported from URL", { correlationId, knowledgeBaseId, documentId: result.value.id });
    trackEvent("knowledge_base_document_url_import_success", { correlationId, properties: { knowledgeBaseId } });
    setUrl("");
    onImported();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}
    >
      <label htmlFor={inputId}>從網址匯入</label>
      <br />
      <input
        id={inputId}
        type="text"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          setError(null);
        }}
        disabled={pending}
        placeholder="https://example.com/document"
        style={{ width: "100%", maxWidth: 480 }}
      />
      <br />
      <button type="submit" disabled={pending || !url.trim()}>
        匯入
      </button>

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          匯入中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message={error} />
        </div>
      )}
    </form>
  );
}
