import type { ApiError, Result } from "@ai-km/types";
import { EQUIPMENT_OPTIONS } from "./equipment";
import { ERROR_CODE_OPTIONS } from "./error-codes";

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
 *
 * E07-S003 "Serial-number input" adds `serialNumber` — also optional,
 * for the same reason and by the same precedent: S002's own EVIDENCE
 * already documented equipment selection alone as "a complete closed
 * loop, not a half-finished feature" (select → create → appears in the
 * list). Making serial number REQUIRED now would retroactively break
 * that already-reviewed, already-approved capability — same
 * "growing set of independently-optional fields on one entity" shape
 * KnowledgeBaseSummary's visibleToRoles/members/boundPrompt/boundModel/
 * folderSyncPath all follow (S003-created-a-KB-with-just-a-name stayed
 * valid through every later field S006-S016 added). No format
 * validation beyond trimming — SOURCE_BASELINE names no real serial
 * number format anywhere, and inventing one would be exactly the kind
 * of unrequested constraint the Anti-hallucination Guard forbids.
 *
 * E07-S004 "Error-code search UI" adds `errorCode` — optional for the
 * same "don't retroactively break an already-approved simpler flow"
 * reason as serialNumber, but unlike serialNumber it references
 * ERROR_CODE_OPTIONS by its own `code` value rather than accepting
 * arbitrary free text — same "reference a fixed list, validate against
 * it, resolve display text by lookup" shape `equipmentId` already
 * established, just applied to a second fixed-vocabulary list. A
 * present-but-unrecognized errorCode is still rejected (see
 * createMaintenanceCase's own doc comment) — optionality means
 * "the field may be entirely absent", not "any string is accepted when
 * it IS present".
 *
 * E07-S005 "Problem description input" deliberately adds NO new field
 * — it fulfills the promise this file's own doc comments already made
 * since S002 ("title starts as the selected equipment's own name...
 * S005 is free to overwrite it once a real problem description
 * exists"). `title` itself becomes the problem description when one is
 * given, exactly the way it already read as one all along: every S001
 * seed case's own `title` ("生產線 3 號機台異音診斷",
 * "包裝機感測器故障排除", "空壓機無法啟動") already reads as a short
 * problem description, not an equipment name — S005 just makes that
 * genuinely user-authored instead of a placeholder equipment-name
 * fallback. Same role `title` already plays for a conversation (the
 * user's own words, not a separate "description" field bolted on
 * beside it).
 */
export interface MaintenanceCaseSummary {
  id: string;
  title: string;
  updatedAt: string;
  equipmentId?: string;
  serialNumber?: string;
  errorCode?: string;
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
 * E07-S006 "Diagnostic session shell". First single-item lookup this
 * file exports — same `value: T | null` (not a rejected Promise or a
 * NOT_FOUND error) shape getKnowledgeBase already establishes for "the
 * fetch itself succeeded; the id just doesn't resolve to anything",
 * leaving the NOT_FOUND-vs-error distinction to the caller. Needed now
 * because starting a diagnostic session (this same story) requires
 * confirming the case it's for genuinely exists before creating one —
 * same "fails closed with NOT_FOUND if the parent doesn't exist"
 * precedent addKnowledgeBaseDocument already follows for its own
 * knowledgeBaseId.
 */
export async function getMaintenanceCase(id: string): Promise<Result<MaintenanceCaseSummary | null, ApiError>> {
  return { ok: true, value: readStore().find((item) => item.id === id) ?? null };
}

/**
 * E07-S002 "Equipment selector" / E07-S003 "Serial-number input" /
 * E07-S004 "Error-code search UI" / E07-S005 "Problem description
 * input". Creates the case with whatever's been entered — this is now
 * the last field E07's own "grow one field per story" sequence adds to
 * this form (E07-S006 "Diagnostic session shell" is a different kind
 * of story, not another field on this one).
 *
 * Rejects an empty OR unrecognized `equipmentId` with VALIDATION_ERROR
 * — same server-validates-too discipline as createKnowledgeBase, even
 * though the `<select>` this is called from only ever offers real
 * EQUIPMENT_OPTIONS ids. Fails closed rather than trusting a bypassed
 * client to have picked a real one. `serialNumber` is optional free
 * text (see this file's own MaintenanceCaseSummary doc comment) —
 * trimmed, and only stored when genuinely non-empty, same "absence
 * means not-yet-set" precedent addKnowledgeBaseDocumentFromText's own
 * `sizeBytes` doc comment already establishes for an optional field
 * that shouldn't be stored as an empty string. `errorCode` is also
 * optional, but — unlike serialNumber — validated against
 * ERROR_CODE_OPTIONS when present: an empty/omitted value is fine (the
 * field simply isn't set yet), but a non-empty, unrecognized one is
 * rejected with VALIDATION_ERROR, same "optional presence, but no
 * garbage-in when present" contract equipmentId's own always-required
 * validation follows, just relaxed to allow absence.
 *
 * `problemDescription` doesn't get its own stored field (see this
 * file's own MaintenanceCaseSummary doc comment) — when given, its
 * trimmed text directly BECOMES `title`, replacing the equipment-name
 * fallback S002 established. Omitting it (or leaving it whitespace-
 * only) keeps that original fallback exactly as before, so S002's own
 * already-approved equipment-only flow stays untouched — same
 * "optional field never breaks the simpler already-working path"
 * precedent every field since S003 has followed.
 */
export async function createMaintenanceCase(
  equipmentId: string,
  serialNumber?: string,
  errorCode?: string,
  problemDescription?: string,
): Promise<Result<MaintenanceCaseSummary, ApiError>> {
  const equipment = EQUIPMENT_OPTIONS.find((option) => option.id === equipmentId);
  if (!equipment) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請選擇設備。" } };
  }

  const trimmedSerialNumber = serialNumber?.trim();

  const trimmedErrorCode = errorCode?.trim();
  if (trimmedErrorCode && !ERROR_CODE_OPTIONS.some((option) => option.code === trimmedErrorCode)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請選擇有效的錯誤代碼。" } };
  }

  const trimmedProblemDescription = problemDescription?.trim();

  const maintenanceCase: MaintenanceCaseSummary = {
    id: crypto.randomUUID(),
    title: trimmedProblemDescription || equipment.name,
    updatedAt: new Date().toISOString(),
    equipmentId,
    ...(trimmedSerialNumber ? { serialNumber: trimmedSerialNumber } : {}),
    ...(trimmedErrorCode ? { errorCode: trimmedErrorCode } : {}),
  };
  writeStore([maintenanceCase, ...readStore()]);
  return { ok: true, value: maintenanceCase };
}
