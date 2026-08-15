import type { ApiError, Result } from "@ai-km/types";
import { EQUIPMENT_OPTIONS } from "./equipment";

/**
 * E07-S001 "Maintenance home". A maintenance case's recent-list summary —
 * same "fields deliberately minimal, mirroring lib/conversations.ts's
 * ORIGINAL E03-S001 shape" precedent KnowledgeBaseSummary (E05-S001)
 * already established: `title` + `updatedAt` is everything a bare
 * landing-page list needs to display. No `errorCode`/`status` field
 * yet — those belong to their own later stories (E07-S004 "Error-code
 * search UI", E07-S019 "Completion summary" and neighbors), exactly the
 * same "don't invent a field ahead of the story that actually owns it"
 * discipline KnowledgeBaseSummary's own doc comments repeatedly cite
 * (visibleToRoles waited for S006, members for S007, boundPrompt for
 * S008, and so on). `title` is free-form text describing the case (the
 * same role `name` plays for a knowledge base, or `title` for a
 * conversation).
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
 *
 * E07-S002 "Equipment selector" adds `equipmentId` — optional, since
 * S001's own 3 seed cases predate this field and stay valid without it
 * (same "absence means not-yet-set, not a different empty state"
 * reasoning KnowledgeBaseSummary.visibleToRoles' own doc comment
 * already establishes). References EQUIPMENT_OPTIONS by id, not a
 * denormalized name snapshot — same shape `boundModel` already uses for
 * AI_MODELS, so a case's equipment display name is always derived by
 * lookup, never allowed to drift from the source list.
 */
export interface MaintenanceCaseSummary {
  id: string;
  title: string;
  updatedAt: string;
  equipmentId?: string;
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

/** E07-S002 "Equipment selector". First writeStore() caller — S001 (list-only) deliberately left it out. */
function writeStore(items: MaintenanceCaseSummary[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * All maintenance cases, most-recently-updated first — same
 * "list needs an explicit, deterministic order, not insertion order"
 * reasoning as listConversations' own sort.
 */
export async function listMaintenanceCases(): Promise<Result<MaintenanceCaseSummary[], ApiError>> {
  return {
    ok: true,
    value: [...readStore()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

/**
 * E07-S002 "Equipment selector". Creates the minimal viable case: an
 * equipment selection and nothing else yet — serial number (S003),
 * error code (S004), and problem description (S005) are each their own
 * later story, same "grow one field per story" shape KnowledgeBaseSummary
 * followed across S006-S016. `title` starts as the selected equipment's
 * own name (the only honest label available before S005 exists) —
 * S005 is free to overwrite it once a real problem description exists,
 * the same way KnowledgeDocumentNameEditor (S023) later became the
 * sole owner of an already-established field's display.
 *
 * Rejects an empty OR unrecognized `equipmentId` with VALIDATION_ERROR
 * — same server-validates-too discipline as createKnowledgeBase, even
 * though the `<select>` this is called from only ever offers real
 * EQUIPMENT_OPTIONS ids. Fails closed rather than trusting a bypassed
 * client to have picked a real one.
 */
export async function createMaintenanceCase(equipmentId: string): Promise<Result<MaintenanceCaseSummary, ApiError>> {
  const equipment = EQUIPMENT_OPTIONS.find((option) => option.id === equipmentId);
  if (!equipment) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請選擇設備。" } };
  }

  const maintenanceCase: MaintenanceCaseSummary = {
    id: crypto.randomUUID(),
    title: equipment.name,
    updatedAt: new Date().toISOString(),
    equipmentId,
  };
  writeStore([maintenanceCase, ...readStore()]);
  return { ok: true, value: maintenanceCase };
}
