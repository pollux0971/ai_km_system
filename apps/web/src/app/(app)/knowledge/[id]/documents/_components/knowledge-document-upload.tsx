"use client";

import { useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { addKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";
import { formatFileSize } from "./format-file-size";

const logger = createLogger("web:knowledge-document-upload");

/**
 * E05-S011 "Single-file upload". A select-then-confirm two-step flow
 * (pick a file → review its name/size → explicit 上傳 button), not
 * S06/S07/S09's instant-apply-on-change pattern — those instant-apply
 * to a small fixed set of already-safe options (roles, models); a file
 * selected from the OS picker deserves a chance to review/reconsider
 * before committing, closer to S08's draft-then-儲存 shape. Single file
 * only (no `multiple` on the input) — matches this story's own title;
 * E05-S012 "Multi-file upload" is its own separate later story.
 *
 * Takes an `onUploaded` callback rather than owning the document list
 * itself — this component's only job is the upload action; the parent
 * (KnowledgeDocumentList) owns re-fetching the list, same
 * separation-of-concerns FileAttachmentPicker already has from
 * MessageComposer (picker reports selection via a callback prop,
 * doesn't own where the files ultimately get submitted to).
 *
 * No real upload happens here — no file bytes are read, stored, or
 * transmitted anywhere; only `file.name`/`file.size` (metadata already
 * available client-side without any network call) are passed to
 * addKnowledgeBaseDocument(). Same "Frontend/BFF may never connect
 * directly to Object Storage" boundary that made FileAttachmentPicker
 * (E03-S008) a purely client-side selection UI — see that component's
 * own doc comment and addKnowledgeBaseDocument's for the full
 * reasoning; the real Upload API and Object Storage are E06-S01/S02
 * (Team B), both `todo`.
 *
 * `formatFileSize` lives in ./format-file-size.ts, shared with
 * knowledge-document-list.tsx (both this story's/S010's own files
 * within the same route) — not imported from FileAttachmentPicker
 * (E03-S008), which independently has the same 4-line helper: that
 * file belongs to a different domain outside this story's allowed
 * scope, so the duplication crosses the domain boundary there but not
 * here. See format-file-size.ts's own doc comment.
 *
 * Telemetry deliberately excludes the file NAME — a filename is
 * user/filesystem-chosen free text that can itself describe sensitive
 * content (e.g. a client or personnel name), closer to
 * `name`/`description`/`boundPrompt` (S008) than to a fixed-vocabulary
 * enum like AiModel/Role (S006/S007/S009) — same "don't log enterprise
 * content" restraint, applied here to a new kind of field. `sizeBytes`
 * is included — it's just a number, not content.
 *
 * Functional AC 7 (audit event for sensitive operations) is judged N/A
 * — adding a new document record is a content-creation action, not an
 * access-control change, same category S003 "Create KB form" already
 * established (creating a new entity ≠ granting/revoking a permission,
 * unlike S006/S007). No real file content is actually read, stored, or
 * transmitted by this mock either, so there is nothing yet for a real
 * audit trail to meaningfully describe beyond what the structured
 * telemetry below already captures.
 */
export default function KnowledgeDocumentUpload({
  knowledgeBaseId,
  onUploaded,
}: {
  knowledgeBaseId: string;
  onUploaded: () => void;
}) {
  const inputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function handleFileSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSelectedFile(files[0] ?? null);
    setError(false);
  }

  async function handleUpload() {
    if (!selectedFile || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("uploading document", { correlationId, knowledgeBaseId, sizeBytes: selectedFile.size });
    trackEvent("knowledge_base_document_upload_attempt", {
      correlationId,
      properties: { knowledgeBaseId, sizeBytes: selectedFile.size },
    });

    const result = await addKnowledgeBaseDocument(knowledgeBaseId, selectedFile.name, selectedFile.size);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to upload document", { correlationId, knowledgeBaseId, code: result.error.code });
      trackEvent("knowledge_base_document_upload_failure", {
        correlationId,
        properties: { knowledgeBaseId, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("document uploaded", { correlationId, knowledgeBaseId, documentId: result.value.id });
    trackEvent("knowledge_base_document_upload_success", {
      correlationId,
      properties: { knowledgeBaseId, sizeBytes: result.value.sizeBytes },
    });
    setSelectedFile(null);
    onUploaded();
  }

  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e5e5e5" }}>
      <label htmlFor={inputId}>上傳文件</label>
      <br />
      <input
        id={inputId}
        type="file"
        disabled={pending}
        onChange={(event) => {
          handleFileSelected(event.target.files);
          // Reset so re-selecting the exact same file still fires
          // onChange — same reasoning FileAttachmentPicker's own input
          // already documents (browsers treat an unchanged value as
          // no-op otherwise).
          event.target.value = "";
        }}
      />

      {selectedFile && (
        <p style={{ marginTop: 8 }}>
          已選擇:{selectedFile.name}({formatFileSize(selectedFile.size)})
          <br />
          <button type="button" onClick={handleUpload} disabled={pending}>
            上傳
          </button>
        </p>
      )}

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          上傳中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="上傳文件失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
