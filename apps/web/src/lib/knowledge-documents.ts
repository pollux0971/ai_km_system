import type { ApiError, Result } from "@ai-km/types";

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

/**
 * Same sessionStorage-backed reasoning as knowledge-bases.ts's own
 * readStore(). No matching writeStore() yet — this story is list-only
 * (S011 "Single-file upload" is the first to ever add a document);
 * unlike knowledge-bases.ts, where writeStore() was already needed by
 * this same file's own create/update exports, nothing here calls one
 * yet, so adding it now would just be an untested, uncalled function.
 * S011 adds it alongside its own first caller.
 */
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
