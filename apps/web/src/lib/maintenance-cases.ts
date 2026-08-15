import type { ApiError, Result } from "@ai-km/types";

/**
 * E07-S001 "Maintenance home". A maintenance case's recent-list summary —
 * same "fields deliberately minimal, mirroring lib/conversations.ts's
 * ORIGINAL E03-S001 shape" precedent KnowledgeBaseSummary (E05-S001)
 * already established: `title` + `updatedAt` is everything a bare
 * landing-page list needs to display. No `equipmentName`/`errorCode`/
 * `status` field yet — those belong to their own later stories
 * (E07-S002 "Equipment selector", E07-S004 "Error-code search UI",
 * E07-S019 "Completion summary" and neighbors), exactly the same
 * "don't invent a field ahead of the story that actually owns it"
 * discipline KnowledgeBaseSummary's own doc comments repeatedly cite
 * (visibleToRoles waited for S006, members for S007, boundPrompt for
 * S008, and so on). `title` is free-form text describing the case (the
 * same role `name` plays for a knowledge base, or `title` for a
 * conversation) — until Equipment/Error-code exist as real fields,
 * this is the only honest way to label a case at all.
 *
 * The real MaintenanceCase entity and its diagnostic engine belong to
 * E08 (Team B, Maintenance Intelligence Backend) — zero contracts exist
 * yet under contracts/ for it. This is a local Team-A mock, same
 * "local mock until the owning domain's contract exists" precedent as
 * ConversationSummary/KnowledgeBaseSummary themselves (SOURCE_BASELINE
 * §5 pinned decision #35, "Team A 不等待 Backend 完成才開始").
 *
 * No `listMaintenanceCases(query)` search parameter — unlike
 * KnowledgeBaseSummary (E05-S002 "Knowledge search/filter") and
 * ConversationSummary (E03-S023 "Conversation search"), E07's own epic
 * file has no dedicated search story in its 25-story list; inventing
 * one here would be reaching ahead of what this story's own title
 * ("home") asks for. If a later story needs it, it can add the
 * parameter the same way S002 added it to listKnowledgeBases without
 * changing this function's existing call sites.
 */
export interface MaintenanceCaseSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Seed data: 3 sample cases, same "a handful of realistic, varied
 * examples" precedent SAMPLE_KNOWLEDGE_BASES/SAMPLE_CONVERSATIONS
 * already established, not an empty or single-item fixture — a
 * genuinely empty list is exercised by a dedicated unit/component test
 * with a mocked empty response instead, same as KnowledgeList's own
 * "尚無知識庫" test does.
 */
const SAMPLE_MAINTENANCE_CASES: MaintenanceCaseSummary[] = [
  {
    id: "case-sample-1",
    title: "生產線 3 號機台異音診斷",
    updatedAt: "2026-08-14T06:30:00.000Z",
  },
  {
    id: "case-sample-2",
    title: "包裝機感測器故障排除",
    updatedAt: "2026-08-13T02:15:00.000Z",
  },
  {
    id: "case-sample-3",
    title: "空壓機無法啟動",
    updatedAt: "2026-08-11T08:00:00.000Z",
  },
];

const STORAGE_KEY = "ai-km:mock-maintenance-cases";

/** Same sessionStorage-backed reasoning as lib/knowledge-bases.ts's own readStore(). */
function readStore(): MaintenanceCaseSummary[] {
  if (typeof window === "undefined") return SAMPLE_MAINTENANCE_CASES;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SAMPLE_MAINTENANCE_CASES;
  try {
    return JSON.parse(raw) as MaintenanceCaseSummary[];
  } catch {
    return SAMPLE_MAINTENANCE_CASES;
  }
}

/**
 * All maintenance cases, most-recently-updated first — same
 * "list needs an explicit, deterministic order, not insertion order"
 * reasoning as listConversations' own sort. No writeStore()/mutation
 * export yet — this story's own scope is the read-only landing list;
 * nothing later in this file creates or edits a case yet, that begins
 * with E07-S002 onward.
 */
export async function listMaintenanceCases(): Promise<Result<MaintenanceCaseSummary[], ApiError>> {
  return {
    ok: true,
    value: [...readStore()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}
