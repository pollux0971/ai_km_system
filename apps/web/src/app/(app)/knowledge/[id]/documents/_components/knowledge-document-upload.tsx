"use client";

import { useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { addKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";
import { simulateUploadStep } from "@/lib/upload-progress";
import { formatFileSize } from "./format-file-size";

const logger = createLogger("web:knowledge-document-upload");

/** See this component's own doc comment for why this prefers webkitRelativePath. */
function displayName(file: File): string {
  return file.webkitRelativePath || file.name;
}

/**
 * E05-S011 "Single-file upload" / E05-S012 "Multi-file upload" /
 * E05-S013 "Folder upload". A
 * select-then-confirm two-step flow (pick file(s) → review each one's
 * name/size, remove any before committing → explicit 上傳 button), not
 * S06/S07/S09's instant-apply-on-change pattern — those instant-apply
 * to a small fixed set of already-safe options (roles, models); files
 * picked from the OS file dialog deserve a chance to review/reconsider
 * before committing, closer to S08's draft-then-儲存 shape.
 *
 * `multiple` on the input, and selecting accumulates onto the existing
 * list rather than replacing it (`setSelectedFiles((prev) => [...prev,
 * ...])`), with a per-item 移除 button — exactly
 * MessageComposer/FileAttachmentPicker's (E03-S008) own established
 * pattern for the same "pick several files across possibly multiple
 * dialog invocations, review, remove any before submitting" shape; a
 * native `<input multiple>`'s own `.files` gets replaced wholesale on
 * every dialog invocation, so accumulating in component state (not
 * just trusting the input's current `.files`) is what makes "add more
 * files in a second picker invocation" possible at all.
 *
 * A SECOND, separate `<input type="file">` (not a toggle on the first
 * one) provides folder selection — `webkitdirectory` is a static
 * attribute the browser reads once when the picker opens, not
 * something togglable per-click on a single input without swapping the
 * DOM node, so two visually-distinct, separately-labeled inputs
 * ("上傳文件" / "上傳資料夾") is the natural shape, matching how real
 * products (e.g. Google Drive) commonly offer "Upload files" and
 * "Upload folder" as two distinct entry points. Both inputs feed the
 * exact same `handleFilesSelected` accumulation into the same
 * `selectedFiles` list — folder-selected files aren't a separate
 * concept from individually-picked ones once selected, they're still
 * just `File` objects, so the entire preview/remove/upload/telemetry
 * machinery below needs zero changes to support them.
 *
 * `webkitdirectory` isn't a recognized prop in React's built-in
 * `InputHTMLAttributes` typing (it's a non-standard, WebKit-prefixed
 * attribute despite being supported by every major browser), so it's
 * set imperatively via a callback ref rather than a JSX prop or an
 * `any`-typed prop spread — avoids both a type-safety hole and a
 * second `useEffect` render round-trip (a callback ref runs
 * synchronously when the node mounts).
 *
 * `displayName()` prefers `file.webkitRelativePath` (e.g.
 * "報告資料夾/2026/Q3/摘要.pdf") over the bare `file.name` — only
 * folder-selected files ever have a non-empty `webkitRelativePath`;
 * individually-picked files (this story's own S011/S012 flows) keep
 * showing and uploading under their plain name exactly as before, this
 * is purely additive. Preserving the relative path (not flattening to
 * just the base filename) matters specifically for folder uploads:
 * multiple same-named files from different subfolders (a real
 * possibility once someone selects a whole folder tree) would
 * otherwise be visually indistinguishable in the preview list and in
 * knowledge-document-list.tsx's own rendering — same reasoning that
 * knowledge-documents.ts's own `name` field doc comment gives for
 * "the extension in `name` already visually communicates type", now
 * extended to "the relative path visually communicates provenance".
 * No document-shape or lib-layer change needed — `name` was always a
 * free-form string; a folder-qualified name is still just a string.
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
 * Uploads SEQUENTIALLY (a `for...of` loop with `await` each), not via
 * `Promise.all` — addKnowledgeBaseDocument's own store write is a
 * synchronous read-modify-write (readStore() then writeStore(), no
 * await between them) sandwiched around one real await point
 * (getKnowledgeBase). Two concurrent calls interleaved via Promise.all
 * would only be safe by relying on that exact microtask-scheduling
 * detail never changing — sequential execution doesn't depend on it,
 * stays correct even if either function later gains a genuine async
 * delay, and gives a natural place to show incremental progress. This
 * is also the concrete reasoning behind Functional AC 5 (no undefined
 * side effect from concurrent/retried requests) for this story:
 * per-file order and completion are fully deterministic.
 *
 * Each file is its own independent unit of work — one file failing
 * (e.g. a hypothetical empty-name rejection) does not block or roll
 * back the others, matching how real multi-file uploaders behave and
 * how a user would expect "4 of 5 succeeded" to be MORE useful than
 * losing all 5 over one bad file. Failed files stay selected (removed
 * from the list only on success) so the user can retry just those
 * without re-picking the ones that already succeeded — extending
 * S011's own "keep the selection on failure" reasoning from a single
 * file to a per-file basis within a batch. onUploaded() fires once, if
 * at least one file in the batch succeeded — no reason to re-fetch the
 * list from a batch that fully failed.
 *
 * The preview `<ul>` carries `aria-label="待上傳檔案"` — this page's
 * app shell already renders its own `<nav>` `<ul>`/`<li>` items
 * (sidebarNav), so an unscoped `getByRole("listitem")` in an E2E test
 * (which renders the full page, unlike a unit test in isolation) would
 * otherwise ambiguously match both; same "give an ambiguous landmark
 * role a distinguishing accessible name" idiom this codebase's own
 * E2E specs already use for `getByRole("navigation", { name: "主導覽"
 * })`.
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
 * is included — it's just a number, not content. One
 * attempt/success/failure telemetry triple PER FILE (not one per
 * batch) — each file is genuinely its own attempt, same reasoning as
 * the sequential-not-parallel upload loop above.
 *
 * Functional AC 7 (audit event for sensitive operations) is judged N/A
 * — adding a new document record is a content-creation action, not an
 * access-control change, same category S003 "Create KB form" already
 * established (creating a new entity ≠ granting/revoking a permission,
 * unlike S006/S007). No real file content is actually read, stored, or
 * transmitted by this mock either, so there is nothing yet for a real
 * audit trail to meaningfully describe beyond what the structured
 * telemetry above already captures.
 *
 * E05-S017 "Upload progress" replaces the flat, unconditional "上傳
 * 中…" status text with a per-file counter ("上傳中…（第 N / total
 * 筆）") that advances as each file in the batch resolves — success or
 * failure alike, since this is "how many files have been processed so
 * far", not "how many succeeded" (that distinction stays owned by the
 * existing failedCount/ErrorMessage reporting below, untouched by this
 * story). `uploadProgress` is set at the START of each loop iteration
 * (1-indexed — the very first render during upload already reads "第 1
 * / N 筆", not "第 0 / N 筆"), and `simulateUploadStep()` (see that
 * module's own doc comment) is awaited once per file so each count has
 * genuine visible time on screen rather than flashing through a whole
 * batch near-instantly. Deliberately NOT a new "processing failure
 * state" — E05-S020 is its own dedicated later story for that; a
 * failed file here still advances the counter and still lands in the
 * pre-existing failedCount/ErrorMessage path exactly as before.
 */
export default function KnowledgeDocumentUpload({
  knowledgeBaseId,
  onUploaded,
}: {
  knowledgeBaseId: string;
  onUploaded: () => void;
}) {
  const inputId = useId();
  const folderInputId = useId();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSelectedFiles((previous) => [...previous, ...Array.from(files)]);
    setFailedCount(0);
  }

  function handleRemove(index: number) {
    if (pending) return;
    setSelectedFiles((previous) => previous.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (selectedFiles.length === 0 || pending) return;

    setPending(true);
    setFailedCount(0);
    const total = selectedFiles.length;

    const remaining: File[] = [];
    let anySucceeded = false;

    for (const [index, file] of selectedFiles.entries()) {
      setUploadProgress({ current: index + 1, total });
      const correlationId = crypto.randomUUID();
      logger.info("uploading document", { correlationId, knowledgeBaseId, sizeBytes: file.size });
      trackEvent("knowledge_base_document_upload_attempt", {
        correlationId,
        properties: { knowledgeBaseId, sizeBytes: file.size },
      });

      const result = await addKnowledgeBaseDocument(knowledgeBaseId, displayName(file), file.size);

      if (!result.ok) {
        logger.error("failed to upload document", { correlationId, knowledgeBaseId, code: result.error.code });
        trackEvent("knowledge_base_document_upload_failure", {
          correlationId,
          properties: { knowledgeBaseId, code: result.error.code },
        });
        remaining.push(file);
      } else {
        logger.info("document uploaded", { correlationId, knowledgeBaseId, documentId: result.value.id });
        trackEvent("knowledge_base_document_upload_success", {
          correlationId,
          properties: { knowledgeBaseId, sizeBytes: result.value.sizeBytes },
        });
        anySucceeded = true;
      }

      await simulateUploadStep();
    }

    setPending(false);
    setUploadProgress(null);
    setSelectedFiles(remaining);
    setFailedCount(remaining.length);
    if (anySucceeded) onUploaded();
  }

  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #e5e5e5" }}>
      <label htmlFor={inputId}>上傳文件</label>
      <br />
      <input
        id={inputId}
        type="file"
        multiple
        disabled={pending}
        onChange={(event) => {
          handleFilesSelected(event.target.files);
          // Reset so re-selecting the exact same file still fires
          // onChange — same reasoning FileAttachmentPicker's own input
          // already documents (browsers treat an unchanged value as
          // no-op otherwise).
          event.target.value = "";
        }}
      />
      <br />
      <label htmlFor={folderInputId}>上傳資料夾</label>
      <br />
      <input
        id={folderInputId}
        type="file"
        multiple
        disabled={pending}
        ref={(el) => {
          // webkitdirectory isn't a recognized JSX prop — see this
          // component's own doc comment for why this is set here,
          // imperatively, instead.
          if (el) el.webkitdirectory = true;
        }}
        onChange={(event) => {
          handleFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />

      {selectedFiles.length > 0 && (
        <>
          <ul aria-label="待上傳檔案">
            {selectedFiles.map((file, index) => (
              <li key={`${displayName(file)}-${index}`}>
                {displayName(file)}({formatFileSize(file.size)})
                <button type="button" onClick={() => handleRemove(index)} disabled={pending}>
                  移除 {displayName(file)}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={handleUpload} disabled={pending}>
            上傳
          </button>
        </>
      )}

      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          {uploadProgress ? `上傳中…（第 ${uploadProgress.current} / ${uploadProgress.total} 筆）` : "上傳中…"}
        </p>
      )}
      {failedCount > 0 && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message={`${failedCount} 個檔案上傳失敗，請稍後再試。`} />
        </div>
      )}
    </div>
  );
}
