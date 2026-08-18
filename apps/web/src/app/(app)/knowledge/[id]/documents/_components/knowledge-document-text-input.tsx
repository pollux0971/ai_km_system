"use client";

import { useId, useState, type FormEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { addKnowledgeBaseDocumentFromText } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-text-input");

/**
 * E05-S015 "Text knowledge input". A third, independent way to add a
 * document to this page, alongside KnowledgeDocumentUpload (S011-S013)
 * and KnowledgeDocumentUrlImport (S014) — same "separate component per
 * fundamentally different interaction shape" reasoning
 * KnowledgeDocumentUrlImport's own doc comment already gives: this is
 * a title field + a multi-line textarea + explicit submit, not a file
 * picker or a single URL field. Rendered on the same
 * /knowledge/[id]/documents page, sharing the same `refetchDocuments`
 * callback (passed as `onAdded`) as its siblings.
 *
 * Title and content are separate fields — same "give this a name, then
 * its body" split createKnowledgeBase's name/description already
 * established, not a single blob the way a URL has no separate title
 * independent of the address itself.
 *
 * Both an empty title AND an empty content are rejected (see
 * addKnowledgeBaseDocumentFromText's own doc comment for why empty
 * content specifically has no meaningful interpretation here, unlike
 * S008's boundPrompt) — the 新增 button stays disabled until both
 * fields are non-whitespace, mirroring the same
 * disabled-until-something-to-submit pattern KnowledgeDocumentUrlImport
 * already uses for its own single field.
 *
 * On failure, both fields keep their entered values (not cleared) —
 * same "don't make the user retype everything" precedent as S008's
 * prompt editor and this route's other two add-document components.
 * Shows the SPECIFIC `result.error.message` (not a fixed generic
 * string), same reasoning KnowledgeDocumentUrlImport's own doc comment
 * gives: both possible validation messages here are this codebase's
 * own deliberately-authored UI copy, and — like a malformed URL — an
 * empty title or empty content is the expected, routine way a user
 * discovers their input needs fixing, not a rare edge case a generic
 * message would be good enough for.
 *
 * Telemetry excludes both the title AND the content — free-form
 * user-authored text either way, same restraint as S008 (prompt text)
 * and S014 (URL). `sizeBytes` IS included — see
 * addKnowledgeBaseDocumentFromText's own doc comment for why it's a
 * real computed value here, safe to log like every other numeric size
 * this route's telemetry already records.
 */
export default function KnowledgeDocumentTextInput({
  knowledgeBaseId,
  onAdded,
}: {
  knowledgeBaseId: string;
  onAdded: () => void;
}) {
  const titleId = useId();
  const contentId = useId();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !title.trim() || !content.trim()) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("adding text knowledge document", { correlationId, knowledgeBaseId });
    trackEvent("knowledge_base_document_text_input_attempt", { correlationId, properties: { knowledgeBaseId } });

    const result = await addKnowledgeBaseDocumentFromText(knowledgeBaseId, title, content);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to add text knowledge document", { correlationId, knowledgeBaseId, code: result.error.code });
      trackEvent("knowledge_base_document_text_input_failure", {
        correlationId,
        properties: { knowledgeBaseId, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    logger.info("text knowledge document added", { correlationId, knowledgeBaseId, documentId: result.value.id });
    trackEvent("knowledge_base_document_text_input_success", {
      correlationId,
      properties: { knowledgeBaseId, sizeBytes: result.value.sizeBytes },
    });
    setTitle("");
    setContent("");
    onAdded();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}
    >
      <label htmlFor={titleId}>標題</label>
      <br />
      <input
        id={titleId}
        type="text"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(null);
        }}
        disabled={pending}
        style={{ width: "100%", maxWidth: 480 }}
      />
      <br />
      <label htmlFor={contentId}>內容</label>
      <br />
      <textarea
        id={contentId}
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setError(null);
        }}
        disabled={pending}
        rows={8}
        style={{ width: "100%", maxWidth: 480 }}
      />
      <br />
      <button type="submit" disabled={pending || !title.trim() || !content.trim()}>
        新增
      </button>

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          新增中…
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
