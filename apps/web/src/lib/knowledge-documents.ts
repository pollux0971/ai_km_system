import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";
import { isFeatureEnabled } from "./feature-flags";
import { getKnowledgeBase } from "./knowledge-bases";

/**
 * E05-S010 "KB document list". A knowledge base's actual document
 * contents — deliberately deferred out of `KnowledgeBaseSummary` itself
 * (see that type's own S001 doc comment: "E05-S10 'KB Document List' is
 * its own later story for a knowledge base's actual document contents;
 * inventing a summary figure here would be reaching ahead of what this
 * story's own title asks for"). Kept in its own module, not a field on
 * KnowledgeBaseSummary, same "conceptually its own collection keyed by
 * a parent id" reasoning lib/messages.ts already established for
 * Message vs. ConversationSummary — `listKnowledgeBases()` returning a
 * potentially-large nested document array per item for every list view
 * would be exactly the kind of over-fetching a real
 * `GET /knowledge-bases/{id}/documents` endpoint avoids.
 *
 * The real Document entity belongs to E06 (Team B, Knowledge Ingestion
 * & Indexing) — 36 sub-stories (upload API, object storage, MIME/size/
 * checksum validation, duplicate detection, antivirus, per-format
 * parsers, OCR, chunking, embedding, vector write, versioning, worker
 * queue), all still `todo`, and `contracts/openapi/core.yaml` has no
 * paths for it. This is a local Team-A mock, same "local mock until the
 * owning domain's contract exists" precedent as ConversationSummary/
 * KnowledgeBaseSummary themselves.
 *
 * Fields deliberately minimal: `name` + `sizeBytes` + `uploadedAt` is
 * everything a bare LIST needs to display. No `status`/`mimeType`/
 * `version` field — E05-S011 through S020 (upload, upload/parse/index
 * progress, processing failure state) and E06-S30-32 (document
 * versioning, Team B) are each their own separate later story; this
 * story's title is "list", not "upload" or "processing status", same
 * "don't reach ahead into a later story's scope" discipline
 * knowledge-bases.ts's own field-by-field growth already established.
 * No file-type enum either — E06's own parser stories (PDF/DOCX/PPTX/
 * XLSX/CSV/TXT/Image/OCR) haven't run yet, so inventing a categorization
 * ahead of them would be guessing at their eventual taxonomy; the
 * extension in `name` already visually communicates type well enough
 * for a bare list.
 *
 * `sizeBytes` is optional as of E05-S014 "URL import" — a URL-imported
 * source has no real byte count to report (nothing is actually
 * fetched; see addKnowledgeBaseDocumentFromUrl's own doc comment), and
 * inventing a placeholder number would misrepresent a value that
 * genuinely doesn't exist yet, the same "don't fake data you don't
 * have" discipline S006/S007's "is a setting only" tests already
 * enforce for a different kind of claim. File-sourced documents
 * (addKnowledgeBaseDocument, S011-S013) always still provide a real
 * one — this is purely additive, existing callers are unaffected.
 *
 * `content` is optional as of E05-S015 "Text knowledge input" — the
 * one document source where real body text genuinely exists and is
 * genuinely available (the user typed or pasted it directly; no file
 * to read, no URL to fetch). Unlike file uploads (never store real
 * bytes — Frontend/BFF must never connect directly to Object Storage)
 * or URL imports (nothing is ever fetched), there is no reason to
 * withhold this one, honestly-available piece of content — see
 * addKnowledgeBaseDocumentFromText's own doc comment for the full
 * reasoning, including why `sizeBytes` for THIS source is a real
 * computed value (unlike URL import's) rather than omitted.
 *
 * `status` is optional as of E05-S020 "Processing failure state" —
 * absence means "ready" (the implicit state of every document created
 * before this story, and of every SAMPLE_KNOWLEDGE_BASE_DOCUMENTS
 * fixture below), same "absence is the common/default case" reasoning
 * every other optional field on this type already follows.
 * `"failed"` is the only value ever explicitly written — see
 * addKnowledgeBaseDocument's own doc comment for how a document ends
 * up there. This is a genuinely different failure mode from
 * addKnowledgeBaseDocument returning `ok: false` (E05-S011's own
 * empty-name/NOT_FOUND paths): those mean NO document was ever
 * created at all (E05-S017/S018/S019's own "skip parse/index, keep
 * the file selected for retry" logic is entirely about that case,
 * untouched by this story); `status: "failed"` means a document WAS
 * created — the (simulated) processing that happens to it afterward
 * is what failed, mirroring how a real async ingestion pipeline
 * reports success at upload time and only discovers a processing
 * failure once the pipeline actually runs. E05-S021 "Retry processing
 * action" (a later story) is what will act on a `"failed"` document —
 * this story's own job stops at making that state reachable, real, and
 * visible.
 */
export type DocumentProcessingStatus = "ready" | "failed";

/**
 * `archived` is optional as of E05-S025 "Archive document action" —
 * same "absence means not-yet-set, the common/default case" reasoning
 * every other optional field on this type already follows, and the
 * exact same shape ConversationSummary.archived (E03-S026) already
 * established: every pre-S025 fixture and every existing document
 * simply omits it, and every read site treats an absent value as
 * `false` (not archived) via `?? false` — making it required would
 * force a mechanical, behavior-unrelated update to every one of those.
 */
export interface KnowledgeBaseDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sizeBytes?: number;
  content?: string;
  status?: DocumentProcessingStatus;
  archived?: boolean;
  /**
   * E05-S027 "Document permission editor". Same shape and same "absence
   * means not-yet-configured, distinct from an explicit empty list"
   * reasoning as KnowledgeBaseSummary.visibleToRoles (E05-S006) — an
   * empty array is a meaningful, deliberate "granted to no role" state,
   * not the same thing as "nobody has set this yet". A document-level
   * override sitting alongside the KB-level `visibleToRoles`, not a
   * replacement for it — same "role-based access, per-entity selection"
   * model, just narrowed to one document instead of the whole KB, the
   * same way a document can be individually archived/renamed/deleted
   * without that action needing to go through the KB itself.
   */
  visibleToRoles?: Role[];
  uploadedAt: string;
}

/**
 * Seed data deliberately spans three distinct list sizes across the
 * three existing SAMPLE_KNOWLEDGE_BASES fixtures (knowledge-bases.ts)
 * rather than adding a fourth synthetic-only fixture just for this
 * story: kb-sample-1 gets 3 documents (the multi-item case),
 * kb-sample-2 gets 1 (the single-item case), kb-sample-3 gets 0 (the
 * empty-state case) — so every list-size state this story's UX
 * Acceptance needs to demonstrate already exists naturally, the same
 * "reuse existing fixtures for varied states" approach S002's search
 * tests already relied on.
 */
const SAMPLE_KNOWLEDGE_BASE_DOCUMENTS: KnowledgeBaseDocument[] = [
  {
    id: "doc-sample-1",
    knowledgeBaseId: "kb-sample-1",
    name: "產品保固條款.pdf",
    sizeBytes: 245_000,
    uploadedAt: "2026-08-10T02:00:00.000Z",
  },
  {
    id: "doc-sample-2",
    knowledgeBaseId: "kb-sample-1",
    name: "理賠申請流程.docx",
    sizeBytes: 128_000,
    uploadedAt: "2026-08-11T05:30:00.000Z",
  },
  {
    id: "doc-sample-3",
    knowledgeBaseId: "kb-sample-1",
    name: "常見保固問題 FAQ.pdf",
    sizeBytes: 89_000,
    uploadedAt: "2026-08-13T01:00:00.000Z",
  },
  {
    id: "doc-sample-4",
    knowledgeBaseId: "kb-sample-2",
    name: "設備故障排除手冊.pdf",
    sizeBytes: 1_258_000,
    uploadedAt: "2026-08-11T06:30:00.000Z",
  },
];

const STORAGE_KEY = "ai-km:mock-knowledge-documents";

/** Same sessionStorage-backed reasoning as knowledge-bases.ts's own readStore(). */
function readStore(): KnowledgeBaseDocument[] {
  if (typeof window === "undefined") return SAMPLE_KNOWLEDGE_BASE_DOCUMENTS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_KNOWLEDGE_BASE_DOCUMENTS;
  try {
    return JSON.parse(raw) as KnowledgeBaseDocument[];
  } catch {
    return SAMPLE_KNOWLEDGE_BASE_DOCUMENTS;
  }
}

/**
 * E05-S011 "Single-file upload". First caller of writeStore() — S010
 * (list-only) deliberately left it out since nothing called it yet; see
 * this file's git history for that reasoning.
 */
function writeStore(items: KnowledgeBaseDocument[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * All documents belonging to one knowledge base, in insertion order —
 * same "just filter, no existence check" simplicity as
 * lib/messages.ts's listMessages(conversationId): the pages that render
 * this (knowledge-document-list.tsx, knowledge-detail.tsx) already do
 * their own getKnowledgeBase(id) fetch for loading/error/not-found
 * state, so a nonexistent knowledgeBaseId naturally and correctly
 * yields an empty array here rather than a second redundant existence
 * check. Never returns another knowledge base's documents — filtered
 * strictly by `knowledgeBaseId`, verified by a dedicated test.
 *
 * E05-S025 "Archive document action" adds `archived` as a SECOND
 * filter dimension, applied alongside `knowledgeBaseId` — `false` (the
 * default) selects the normal active list every pre-S025 call site
 * (including knowledge-detail.tsx's own document-count summary, which
 * now correctly excludes archived documents from that headline figure
 * without any change to its own call site) already expects unchanged;
 * `true` selects only archived documents. This is a SWITCH between two
 * mutually-exclusive views, not an "also include archived" toggle
 * merged into one list — same design listConversations (E03-S026)
 * already established for the identical shape of problem.
 */
export async function listKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  archived = false,
): Promise<Result<KnowledgeBaseDocument[], ApiError>> {
  return {
    ok: true,
    value: readStore().filter((document) => document.knowledgeBaseId === knowledgeBaseId && (document.archived ?? false) === archived),
  };
}

/**
 * E05-S011 "Single-file upload". Takes plain `name`/`sizeBytes`
 * primitives already extracted by the caller from a browser `File`
 * object, not the `File` itself — same "extract what's needed before
 * calling the mock layer" shape as lib/messages.ts's sendMessage()
 * taking `attachmentNames: string[]` rather than raw `File[]`, keeping
 * this module platform-agnostic and trivially unit-testable without a
 * DOM File polyfill.
 *
 * No real upload happens here — no file bytes are read, stored, or
 * transmitted anywhere. Same "Frontend/BFF may never connect directly
 * to Object Storage" boundary (this story's own Development
 * Boundaries) that made conversations/[id]/_components/
 * file-attachment-picker.tsx (E03-S008) a purely client-side selection
 * UI with zero real upload — the real Upload API and Object Storage
 * belong to E06-S01/S02 (Team B), both `todo`.
 *
 * Trims and rejects an empty name with VALIDATION_ERROR — same
 * server-side-validates-too discipline as createKnowledgeBase/
 * renameConversation, even though a real browser File's `.name` is
 * very unlikely to ever be empty in practice. No size or file-type
 * validation — same reasoning FileAttachmentPicker's own doc comment
 * already gives for declining to invent a limit archive/AI_KM_BMAD_High_Granularity/
 * never specifies (the one concrete format list in the whole spec
 * belongs to E06's own parser stories, Team B, not this story).
 *
 * Fails closed with NOT_FOUND if the knowledge base doesn't exist —
 * same reused-check pattern as sendMessage() reusing getConversation().
 *
 * E05-S020 "Processing failure state": if `name` contains
 * MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER, the created document is
 * stamped `status: "failed"` — same deterministic bracketed-marker
 * convention MOCK_ANSWER_STATE_TRIGGERS (E03-S021) and
 * MOCK_FILE_PROCESSING_FAILURE_TRIGGER (E03-S029) already established,
 * the only way to make a mock-with-no-real-backend's failure path
 * genuinely reachable and testable through the UI rather than merely
 * theoretically coded. Still returns `ok: true` — the document itself
 * WAS created (this function's own job); marking it failed is a
 * property of the created document, not a reason to reject creating it
 * (see this function's own DocumentProcessingStatus doc comment on
 * KnowledgeBaseDocument for the full reasoning on why this differs
 * from an `ok: false` rejection).
 */
export const MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER = "[模擬:KB_PROCESSING_FAILED]";

export async function addKnowledgeBaseDocument(
  knowledgeBaseId: string,
  name: string,
  sizeBytes: number,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "檔案名稱不得為空。" } };
  }

  const knowledgeBase = await getKnowledgeBase(knowledgeBaseId);
  if (!knowledgeBase.ok) return knowledgeBase;
  if (!knowledgeBase.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const document: KnowledgeBaseDocument = {
    id: crypto.randomUUID(),
    knowledgeBaseId,
    name: trimmedName,
    sizeBytes,
    uploadedAt: new Date().toISOString(),
    // E03-S045: gated behind the "mock_triggers" flag — see
    // feature-flags.ts's own doc comment.
    ...(isFeatureEnabled("mock_triggers") && trimmedName.includes(MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER)
      ? { status: "failed" as const }
      : {}),
  };
  writeStore([...readStore(), document]);
  return { ok: true, value: document };
}

/**
 * E05-S021 "Retry processing action". Acts on a document already
 * created by addKnowledgeBaseDocument (E05-S011/S020) whose (mock)
 * processing ended in `status: "failed"` — the direct next step after
 * that story made the failed state reachable, real, and visible; this
 * one gives the user something to DO about it.
 *
 * Fails closed with NOT_FOUND if the document doesn't exist, OR exists
 * but belongs to a different knowledge base (same "never touches
 * another knowledge base's documents" discipline
 * listKnowledgeBaseDocuments's own doc comment already establishes —
 * checked here, not just filtered, since this is a targeted mutation
 * by id rather than a list read). Fails closed with VALIDATION_ERROR
 * if the document isn't currently `"failed"` — retrying something
 * that was never broken isn't a meaningful action.
 *
 * On success, always clears `status` back to ready (deterministic,
 * not a re-evaluation of MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER
 * against the document's own unchanged name — retrying gives the SAME
 * name back to the SAME check, which would deterministically fail
 * forever, defeating the entire point of a retry action existing at
 * all). A user's deliberate retry click is treated as sufficient
 * signal that the (mock) underlying issue is presumed resolved — same
 * "MVP 可以簡化視覺或演算法,但此能力本身不可缺席" allowance this
 * story's own boilerplate AC explicitly grants; a "retry can also
 * fail" simulation isn't required by this story's AC and isn't
 * invented here.
 *
 * No artificial delay lives inside this function, same as
 * addKnowledgeBaseDocument's own zero-delay shape — a visible "retry
 * in progress" pause is a presentation-layer concern the CALLING
 * component orchestrates (reusing parse-progress.ts/index-progress.ts,
 * since a retry conceptually re-runs parsing and indexing, not
 * uploading — the document already exists).
 */
export async function retryDocumentProcessing(
  knowledgeBaseId: string,
  documentId: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const store = readStore();
  const existing = store.find((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }
  if (existing.status !== "failed") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "這份文件目前不是處理失敗狀態，不需要重試。" } };
  }

  const updated: KnowledgeBaseDocument = { ...existing, status: undefined };
  writeStore(store.map((document) => (document.id === documentId ? updated : document)));
  return { ok: true, value: updated };
}

/**
 * E05-S023 "Document metadata editor". `name` is the only field on
 * KnowledgeBaseDocument that is both genuinely metadata (descriptive,
 * not the content/bytes/processing-state itself) and meaningfully
 * user-editable after the fact — `sizeBytes`/`content`/`status`/
 * `uploadedAt` are each either derived, system-managed, or an
 * immutable historical fact, none of them something a "metadata
 * editor" would let a user change. Renaming a document (e.g. fixing a
 * typo in an uploaded file's original name, or giving a typed-in text
 * document a clearer title after the fact) is the entirety of what
 * this story's own title asks for; inventing additional metadata
 * fields (tags, descriptions, categories) that don't exist anywhere in
 * this codebase yet would be reaching past what SOURCE_BASELINE's own
 * bare title supports.
 *
 * Trims and rejects an empty name with VALIDATION_ERROR — same
 * server-side-validates-too discipline as renameConversation()
 * (E03-S024). Fails closed with NOT_FOUND if the document doesn't
 * exist, OR exists but belongs to a different knowledge base — same
 * cross-KB-safe check retryDocumentProcessing (E05-S021) already
 * established for a targeted-by-id document mutation.
 */
export async function renameKnowledgeBaseDocument(
  knowledgeBaseId: string,
  documentId: string,
  name: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "文件名稱不得為空。" } };
  }

  const store = readStore();
  const existing = store.find((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }

  const updated: KnowledgeBaseDocument = { ...existing, name: trimmedName };
  writeStore(store.map((document) => (document.id === documentId ? updated : document)));
  return { ok: true, value: updated };
}

/**
 * E05-S025 "Archive document action". Closely mirrors
 * archiveConversation/unarchiveConversation (E03-S026) — two separate
 * functions rather than one toggle taking a boolean, same reasoning:
 * each is its own distinct, independently-named user action ("封存" vs
 * "取消封存"), not one generic "set this flag" operation. Reversible —
 * archiving is a visibility/view-filter change, not a destructive one
 * (the document, its content, its status are all untouched); the exact
 * opposite action always undoes it, same "archive/unarchive is one
 * capability with two directions" shape as its conversation precedent.
 *
 * Fails closed with NOT_FOUND if the document doesn't exist, OR exists
 * but belongs to a different knowledge base — same cross-KB-safe check
 * retryDocumentProcessing/renameKnowledgeBaseDocument already
 * established for a targeted-by-id document mutation.
 */
export async function archiveKnowledgeBaseDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const store = readStore();
  const existing = store.find((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }

  const updated: KnowledgeBaseDocument = { ...existing, archived: true };
  writeStore(store.map((document) => (document.id === documentId ? updated : document)));
  return { ok: true, value: updated };
}

export async function unarchiveKnowledgeBaseDocument(
  knowledgeBaseId: string,
  documentId: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const store = readStore();
  const existing = store.find((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }

  const updated: KnowledgeBaseDocument = { ...existing, archived: false };
  writeStore(store.map((document) => (document.id === documentId ? updated : document)));
  return { ok: true, value: updated };
}

/**
 * E05-S026 "Delete document confirmation". Mirrors deleteConversation
 * (E03-S025) — a REAL removal from the store, not a soft/archived flag;
 * S025 "Archive document action" already exists as the separate,
 * reversible capability immediately before this one, so "archive" and
 * "delete" stay deliberately distinct here too. Fails closed with
 * NOT_FOUND for a document that doesn't exist, OR exists but belongs to
 * a different knowledge base — same cross-KB-safe check every other
 * targeted-by-id document mutation in this file already uses; a second
 * delete of an already-deleted id fails closed the same way rather than
 * silently no-op-ing (Functional AC 5 — no undefined duplicate side
 * effect from a retried request).
 *
 * Unlike deleteConversation, which cascades to
 * deleteMessagesForConversation() at the CALLING component (see that
 * function's own doc comment for why the cascade lives one layer up),
 * there is no cascade here to orchestrate: a KnowledgeBaseDocument has
 * no child entities of its own — content/status/sizeBytes/archived are
 * all plain fields on the document record itself, not separately-stored
 * data reachable only through it. Deleting the record is already the
 * whole operation.
 */
export async function deleteKnowledgeBaseDocument(knowledgeBaseId: string, documentId: string): Promise<Result<void, ApiError>> {
  const store = readStore();
  if (!store.some((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId)) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }

  writeStore(store.filter((document) => document.id !== documentId));
  return { ok: true, value: undefined };
}

/**
 * E05-S027 "Document permission editor". Mirrors
 * updateKnowledgeBaseVisibleRoles (E05-S006) — takes the complete new
 * role list (not one add/remove at a time), same "caller reports what's
 * checked now, never diffs against the previous selection itself"
 * reasoning; no VALIDATION_ERROR branch, since an empty array is a
 * meaningful, valid state (deliberately granted to no role), not an
 * invalid one. NOT_FOUND fail-closed covers both a missing document and
 * one that exists but belongs to a different knowledge base, same
 * cross-KB-safe check every other targeted-by-id document mutation in
 * this file already uses.
 *
 * Same "setting only, no real enforcement point" caveat as
 * updateKnowledgeBaseVisibleRoles's own doc comment: nothing in this
 * codebase yet performs real per-user document retrieval that this
 * would gate (E06 Knowledge Ingestion doesn't exist). This document-
 * level override sits ALONGSIDE the KB-level `visibleToRoles`, not in
 * place of it — this function only ever reads/writes this one
 * document's own field, never touches the parent KnowledgeBaseSummary.
 * `visibleToRoles` values are plain fixed-vocabulary role identifiers,
 * not enterprise content, so — same as the KB-level function — this
 * module's UI caller may include them directly in telemetry; this
 * function itself does no logging.
 */
export async function updateKnowledgeBaseDocumentVisibleRoles(
  knowledgeBaseId: string,
  documentId: string,
  visibleToRoles: Role[],
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const store = readStore();
  const existing = store.find((document) => document.id === documentId && document.knowledgeBaseId === knowledgeBaseId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這份文件。" } };
  }

  const updated: KnowledgeBaseDocument = { ...existing, visibleToRoles };
  writeStore(store.map((document) => (document.id === documentId ? updated : document)));
  return { ok: true, value: updated };
}

/**
 * E05-S014 "URL import". A separate function from
 * addKnowledgeBaseDocument, not an overload sharing its `name`
 * parameter — a URL needs its OWN validation (must actually parse as a
 * URL, must be http/https), which is a different concern from "is this
 * a non-empty string" and doesn't apply to a file's `.name` (already
 * guaranteed well-formed by the OS file picker). Rejecting non-http(s)
 * schemes (e.g. `javascript:`, `file:`) is grounded in this story's
 * own title — "URL import" means importing WEB content, not an
 * arbitrary URI scheme — not an invented security restriction; this
 * codebase never renders a document's `name` as a clickable `<a
 * href>`, so there's no navigation-based XSS surface either way.
 *
 * No real fetch happens here — nothing crawls the URL, downloads its
 * content, or extracts anything from it. Same "Frontend/BFF may never
 * connect directly to Object Storage" boundary as
 * addKnowledgeBaseDocument, extended to "no direct external HTTP
 * fetch" for the same reason: the real URL Ingestion (E06-S18) and
 * HTML Extraction (E06-S19) pipelines are both Team B, both `todo`.
 * The resulting KnowledgeBaseDocument stores the URL itself as `name`
 * and omits `sizeBytes` entirely (see that field's own doc comment) —
 * there is no byte count to report for content that was never
 * actually retrieved.
 *
 * Fails closed with NOT_FOUND if the knowledge base doesn't exist —
 * same reused-check pattern as addKnowledgeBaseDocument/sendMessage().
 */
export async function addKnowledgeBaseDocumentFromUrl(
  knowledgeBaseId: string,
  url: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "網址不得為空。" } };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入有效的網址。" } };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只支援 http(s) 網址。" } };
  }

  const knowledgeBase = await getKnowledgeBase(knowledgeBaseId);
  if (!knowledgeBase.ok) return knowledgeBase;
  if (!knowledgeBase.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const document: KnowledgeBaseDocument = {
    id: crypto.randomUUID(),
    knowledgeBaseId,
    name: trimmedUrl,
    uploadedAt: new Date().toISOString(),
  };
  writeStore([...readStore(), document]);
  return { ok: true, value: document };
}

/**
 * E05-S015 "Text knowledge input". Takes a separate `title` and
 * `content` — same "give this a name, then its body" split
 * createKnowledgeBase's `name`/`description` already established, not
 * a single blob the way `addKnowledgeBaseDocumentFromUrl`'s `url` is a
 * single field (a URL has no separate "title" independent of the
 * address itself; typed knowledge naturally does).
 *
 * Rejects an empty CONTENT with VALIDATION_ERROR (as well as an empty
 * title) — unlike `boundPrompt` (S008), where an empty value is a
 * meaningful state ("no custom prompt, fall back to platform
 * default"), a text-knowledge-input document with no content has no
 * analogous meaningful interpretation; the entire point of this
 * capability is adding real content, so an empty submission is
 * rejected the same way an empty file name or malformed URL is.
 *
 * `sizeBytes` here is a REAL, computed value
 * (`new Blob([trimmedContent]).size`, the actual UTF-8 byte length) —
 * a deliberate departure from addKnowledgeBaseDocumentFromUrl's
 * omission. That omission exists because URL import fetches nothing,
 * so no byte count exists to report; here, by contrast, the content
 * genuinely exists (the caller has it in hand), so computing its real
 * size is honest, not fabricated — same "don't fake data you don't
 * have, but don't withhold data you do have either" principle applied
 * to its logical conclusion.
 *
 * `content` itself is stored on the document (see that field's own
 * doc comment on KnowledgeBaseDocument) — but nothing in this story
 * renders it anywhere beyond what already exists (the document list
 * only ever showed name/size/time for any source). Surfacing the full
 * stored text is its own future concern, not something this story's
 * own title ("input") reaches ahead into.
 *
 * Fails closed with NOT_FOUND if the knowledge base doesn't exist —
 * same reused-check pattern as every other addKnowledgeBaseDocument*
 * function.
 */
export async function addKnowledgeBaseDocumentFromText(
  knowledgeBaseId: string,
  title: string,
  content: string,
): Promise<Result<KnowledgeBaseDocument, ApiError>> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "標題不得為空。" } };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "內容不得為空。" } };
  }

  const knowledgeBase = await getKnowledgeBase(knowledgeBaseId);
  if (!knowledgeBase.ok) return knowledgeBase;
  if (!knowledgeBase.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個知識庫。" } };
  }

  const document: KnowledgeBaseDocument = {
    id: crypto.randomUUID(),
    knowledgeBaseId,
    name: trimmedTitle,
    content: trimmedContent,
    sizeBytes: new Blob([trimmedContent]).size,
    uploadedAt: new Date().toISOString(),
  };
  writeStore([...readStore(), document]);
  return { ok: true, value: document };
}
