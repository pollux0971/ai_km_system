import type { ApiError, Result } from "@ai-km/types";

export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

/**
 * E05-S001: the full knowledge base list. Placeholder data source — NOT
 * the real knowledge base contract. Knowledge base entities belong to
 * E06 (Team B, Knowledge Ingestion & Indexing), which doesn't exist yet;
 * contracts/openapi/core.yaml has no paths for it — same "local mock
 * until the owning domain's contract exists" precedent E03's
 * lib/conversations.ts already established for E04.
 *
 * Fields deliberately minimal, mirroring lib/conversations.ts's own
 * ORIGINAL E03-S001 shape (id/title/preview/timestamp) rather than its
 * current, much-accreted one — SOURCE_BASELINE.md's E05 outline gives
 * List (S01), Search (S02), Create (S03), Edit (S04), and Detail (S05)
 * each their own separate story (unlike E03-S001, which bundled list
 * and create together), so this story adds only what a bare list needs:
 * `name` + `description` (the content-preview equivalent of
 * ConversationSummary.lastMessagePreview) + `updatedAt` (the recency
 * signal, meaningful once upload stories S11+ exist). No document count
 * or other summary stat — E05-S10 "KB Document List" is its own later
 * story for a knowledge base's actual document contents; inventing a
 * summary figure here would be reaching ahead of what this story's own
 * title asks for.
 */
const SAMPLE_KNOWLEDGE_BASES: KnowledgeBaseSummary[] = [
  {
    id: "kb-sample-1",
    name: "產品保固政策",
    description: "保固期限、涵蓋範圍與理賠流程等相關文件。",
    updatedAt: "2026-08-13T01:00:00.000Z",
  },
  {
    id: "kb-sample-2",
    name: "設備維修標準作業程序",
    description: "常見設備故障排除步驟與維修 SOP 文件集。",
    updatedAt: "2026-08-11T06:30:00.000Z",
  },
  {
    id: "kb-sample-3",
    name: "人力資源與請假規範",
    description: "請假、加班、差旅申請等人資相關政策文件。",
    updatedAt: "2026-08-09T02:15:00.000Z",
  },
];

const STORAGE_KEY = "ai-km:mock-knowledge-bases";

/**
 * sessionStorage-backed, not a plain module-level variable — same
 * cross-page-chunk survival reasoning as lib/conversations.ts's own
 * readStore(): this module will be imported from multiple independently
 * loaded routes as E05 grows (this list page now, detail/create/edit
 * pages in later stories), so a plain in-memory array wouldn't reliably
 * survive navigating between them.
 */
function readStore(): KnowledgeBaseSummary[] {
  if (typeof window === "undefined") return SAMPLE_KNOWLEDGE_BASES;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_KNOWLEDGE_BASES;
  try {
    return JSON.parse(raw) as KnowledgeBaseSummary[];
  } catch {
    return SAMPLE_KNOWLEDGE_BASES;
  }
}

/**
 * E05-S002 "Knowledge search/filter". SOURCE_BASELINE.md gives this
 * story only its title ("E05-S02 Knowledge Search"); the epic file's
 * own expanded title adds "/filter" — read as the same single
 * mechanism (a search that filters the list), not a second, distinct
 * filter dimension: KnowledgeBaseSummary (E05-S001) has no category/tag
 * field yet for any OTHER kind of filter to apply to, and no
 * SOURCE_BASELINE/epic content suggests one exists.
 *
 * Same design as E03-S023 "Conversation search"'s listConversations():
 * an empty/whitespace-only query is "no search" (returns everything),
 * matching the pre-S002 call site unchanged; matches against `name`
 * only, not `description` — mirrors ConversationSummary's own
 * title-only (not lastMessagePreview) search scope, same "real product
 * sidebar search matches names, not full content" precedent. No
 * debounce — this is an in-memory array filter with no real network
 * latency to debounce against.
 *
 * No pagination added here — unlike E03 (where S022 Pagination and
 * S023 Search are two separate stories), SOURCE_BASELINE's E05 outline
 * (S01-S28) has no dedicated pagination story at all; adding one now
 * would be inventing a capability neither SOURCE_BASELINE nor this
 * story's own title asks for.
 */
export async function listKnowledgeBases(query?: string): Promise<Result<KnowledgeBaseSummary[], ApiError>> {
  const trimmedQuery = query?.trim() ?? "";
  const all = readStore();
  const filtered = trimmedQuery
    ? all.filter((item) => item.name.toLocaleLowerCase().includes(trimmedQuery.toLocaleLowerCase()))
    : all;
  return { ok: true, value: filtered };
}
