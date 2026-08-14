import type { ApiError, Result } from "@ai-km/types";
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
 */
export interface KnowledgeBaseDocument {
  id: string;
  knowledgeBaseId: string;
  name: string;
  sizeBytes: number;
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
 */
export async function listKnowledgeBaseDocuments(knowledgeBaseId: string): Promise<Result<KnowledgeBaseDocument[], ApiError>> {
  return { ok: true, value: readStore().filter((document) => document.knowledgeBaseId === knowledgeBaseId) };
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
 * already gives for declining to invent a limit AI_KM_BMAD_High_Granularity/
 * never specifies (the one concrete format list in the whole spec
 * belongs to E06's own parser stories, Team B, not this story).
 *
 * Fails closed with NOT_FOUND if the knowledge base doesn't exist —
 * same reused-check pattern as sendMessage() reusing getConversation().
 */
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
  };
  writeStore([...readStore(), document]);
  return { ok: true, value: document };
}
