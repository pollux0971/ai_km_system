import type { ApiError, Result } from "@ai-km/types";
import { getMaintenanceCase } from "./maintenance-cases";
import { getCurrentDiagnosticStep } from "./diagnostic-steps";

/**
 * E07-S006 "Diagnostic session shell". The five values are pinned in
 * SOURCE_BASELINE.md's own E08 "Session State" list verbatim — not
 * invented here, and not reorderable/renameable, same discipline this
 * codebase's every other fixed-vocabulary type (AiModel, Role) already
 * follows for a spec-defined enum.
 */
export type DiagnosticSessionStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED" | "CANCELLED";

/**
 * A diagnostic session's own summary — separate from
 * MaintenanceCaseSummary (lib/maintenance-cases.ts), same "conceptually
 * its own collection keyed by a parent id" reasoning lib/messages.ts
 * already established for Message vs. ConversationSummary. The real
 * DecisionSession/DecisionEvent entities and their actual decision-tree
 * navigation belong to E08-S08/S09 (Team B, Maintenance Intelligence
 * Backend) — zero contracts exist yet under contracts/ for either. This
 * is a local Team-A mock, same "local mock until the owning domain's
 * contract exists" precedent every other E05/E07 entity in this
 * codebase already follows.
 *
 * `status` plus, as of E07-S008 "Decision options", `currentStepIndex`
 * (which lib/diagnostic-steps.ts content this session is currently
 * showing — always 0 for a fresh session, see createDiagnosticSession's
 * own doc comment) and `lastSelectedOptionId` (which option the user most
 * recently picked; `undefined` until the first selection), plus, as of
 * E07-S009 "Free-text detail", `lastFreeTextDetail` (optional supplementary
 * text submitted alongside that same selection; `undefined` when none was
 * given), plus, as of E07-S012 "Skip-step UX with reason",
 * `lastSkipReason` (why the user skipped the step instead of answering
 * it; `undefined` unless the most recent transition was a skip). A
 * separate field from `lastFreeTextDetail` — not a reuse of the same
 * slot — because the two mean different things: one is optional extra
 * context alongside a real choice, the other is the mandatory
 * justification for making no choice at all (see skipDiagnosticStep's own
 * doc comment). Plus, as of E07-S013 "Photo upload", `lastPhotoFileName`/
 * `lastPhotoSizeBytes` (metadata for a photo attached alongside that same
 * selection; both `undefined` when none was given) — name/size only, same
 * "honest mock, metadata-only, no real file bytes persisted" convention
 * knowledge-documents.ts's own `KnowledgeBaseDocument` (`name`/`sizeBytes`)
 * and lib/messages.ts's own `attachmentNames` already establish; the real
 * `File` only ever lives transiently in current-step-card.tsx's own
 * component state, same as FileAttachmentPicker's own `File[]` props. All
 * six are plain, Team-A-owned progress markers — not a guess at E08's real
 * `DecisionSession`/`DecisionEvent` shape (E08-S08/S09, Team B; zero
 * contracts exist yet under contracts/ for either), and not a graph
 * position: `currentStepIndex` only ever advances one flat step at a time
 * via selectDecisionOption/skipDiagnosticStep below, never branches (see
 * diagnostic-steps.ts's own top doc comment for why branching itself is
 * deliberately out of scope for Team A). Same "grow one field per story,
 * don't reach into a later story's own scope" discipline
 * maintenance-cases.ts's own doc comments already follow across S002-S005
 * — E07-S007 itself deliberately held off adding either field until a
 * story existed that actually changed them.
 */
export interface DiagnosticSession {
  id: string;
  maintenanceCaseId: string;
  status: DiagnosticSessionStatus;
  currentStepIndex: number;
  lastSelectedOptionId?: string;
  lastFreeTextDetail?: string;
  lastSkipReason?: string;
  lastPhotoFileName?: string;
  lastPhotoSizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "ai-km:mock-diagnostic-sessions";

/** Same sessionStorage-backed reasoning as lib/maintenance-cases.ts's own readStore(). No seed data — a session only ever exists once created through this same story's own createDiagnosticSession(). */
function readStore(): DiagnosticSession[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DiagnosticSession[];
  } catch {
    return [];
  }
}

function writeStore(items: DiagnosticSession[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * The current session for a given case, if one already exists — same
 * `value: T | null` shape getMaintenanceCase/getKnowledgeBase already
 * establish. At most one session per case in this MVP thin slice (no
 * "start a second concurrent session for the same case" capability
 * exists anywhere in this story's own scope); the session page itself
 * (not this function) is what decides whether to create a new one when
 * this resolves null.
 */
export async function getDiagnosticSessionForCase(
  maintenanceCaseId: string,
): Promise<Result<DiagnosticSession | null, ApiError>> {
  return { ok: true, value: readStore().find((session) => session.maintenanceCaseId === maintenanceCaseId) ?? null };
}

/**
 * Starts a new session for a case, at status "OPEN" and `currentStepIndex`
 * 0 — the first, not-yet-progressed pinned state, deliberately not
 * "IN_PROGRESS": this story's own scope is the shell itself, not real
 * step interaction, so nothing has actually progressed yet. E07-S008
 * "Decision options" (a minor correction of this comment's own earlier
 * prediction, which named E07-S007 — that story only ever showed step 0's
 * content, never let anything actually advance) is what genuinely
 * advances a session toward "IN_PROGRESS", via selectDecisionOption below.
 *
 * Fails closed with NOT_FOUND if `maintenanceCaseId` doesn't resolve to
 * a real case — same "fails closed if the parent doesn't exist"
 * precedent addKnowledgeBaseDocument already follows for its own
 * knowledgeBaseId, reusing getMaintenanceCase (this same story's own
 * addition) rather than re-deriving the check.
 *
 * Does NOT check for an already-existing session itself — same
 * separation of concerns getDiagnosticSessionForCase's own doc comment
 * describes: the caller (the session page) is responsible for calling
 * getDiagnosticSessionForCase first and only calling this when that
 * resolves null, so this function doesn't need to silently decide
 * "create vs. resume" on the caller's behalf.
 */
export async function createDiagnosticSession(maintenanceCaseId: string): Promise<Result<DiagnosticSession, ApiError>> {
  const maintenanceCase = await getMaintenanceCase(maintenanceCaseId);
  if (!maintenanceCase.ok) return maintenanceCase;
  if (!maintenanceCase.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個維修案例。" } };
  }

  const now = new Date().toISOString();
  const session: DiagnosticSession = {
    id: crypto.randomUUID(),
    maintenanceCaseId,
    status: "OPEN",
    currentStepIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
  writeStore([session, ...readStore()]);
  return { ok: true, value: session };
}

/**
 * E07-S008 "Decision options". Records which option the user picked and
 * advances `currentStepIndex` by exactly one — never branches, since
 * "which node does this choice lead to" is Team B's DecisionEdge
 * algorithm (E08-S07), not Team A's to invent (see diagnostic-steps.ts's
 * own top doc comment). First successful call also flips a fresh "OPEN"
 * session to "IN_PROGRESS" (a real diagnostic action has now genuinely
 * happened); a session already past "OPEN" keeps its own status
 * (resuming an e.g. "IN_PROGRESS" session and answering its current
 * step again shouldn't downgrade or otherwise touch status).
 *
 * Fails closed with NOT_FOUND for an unknown `sessionId` — same
 * `readStore().find(...)` precedent every other lookup in this file
 * already follows.
 *
 * Fails closed with VALIDATION_ERROR — rather than silently no-op'ing or
 * throwing — for two distinct cases sharing one error code (both are
 * "this call doesn't make sense right now", not two different problems a
 * caller needs to tell apart):
 *   1. `optionId` isn't one of the CURRENT step's real options — same
 *      "reject an unrecognized value against a fixed list, even though
 *      the UI itself would never offer anything else" discipline
 *      maintenance-cases.ts's own createMaintenanceCase already follows
 *      for `equipmentId`/`errorCode`, so a bypassed client can't force a
 *      bogus selection into the store.
 *   2. `session.currentStepIndex` no longer points at a step that HAS
 *      options (today: anything other than 0) — this is what keeps a
 *      repeat/duplicate call (Functional AC 5) from silently advancing
 *      the session a second time; the UI's own options disappear once
 *      step 0 is answered (current-step-card.tsx only renders them when
 *      `step.options` is present), so this path is the server-side half
 *      of the same guarantee, not reachable through the real UI at all,
 *      same "structural, not just client-hidden" precedent role-guard.tsx
 *      already establishes for authorization.
 *
 * `detail` (E07-S009 "Free-text detail") is optional supplementary text
 * submitted alongside the choice — same "required choice + optional free
 * text, one submission" shape createMaintenanceCase already establishes
 * for equipmentId + problemDescription, rather than a second independent
 * action. Trimmed; whitespace-only or omitted both mean "no detail given"
 * (`lastFreeTextDetail` stays `undefined`), same "absence means not-set"
 * precedent createMaintenanceCase's own serialNumber handling already
 * follows. Explicitly overwrites any previous value on every call (not
 * merged/appended) — `lastFreeTextDetail`, like `lastSelectedOptionId`,
 * reflects only the most recent selection.
 *
 * `photo` (E07-S013 "Photo upload") is an optional `File` submitted
 * alongside the same choice — bundled here rather than a standalone
 * `uploadDiagnosticPhoto(sessionId, ...)` action, per /advisor analysis for
 * this story: a photo is evidence FOR a specific answer, same "one
 * submission" shape as `detail` above, not a session-level action like
 * restartDiagnosticSession. Deliberately NOT extended to skipDiagnosticStep
 * — same restraint that function's own `reason` (mandatory, unlike this
 * optional `detail`) already shows by never gaining a `detail` parameter of
 * its own either; a skip has nothing to attach photographic evidence to.
 * Only `name`/`size` metadata is persisted (`lastPhotoFileName`/
 * `lastPhotoSizeBytes`), never the File's bytes — same metadata-only
 * convention `DiagnosticSession`'s own doc comment cites. Like `detail`,
 * explicitly overwrites (via `photo?.name`/`photo?.size`, both `undefined`
 * when `photo` is omitted) rather than merges on every call.
 */
export async function selectDecisionOption(
  sessionId: string,
  optionId: string,
  detail?: string,
  photo?: File,
): Promise<Result<DiagnosticSession, ApiError>> {
  const sessions = readStore();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個診斷 session。" } };
  }

  const currentStep = getCurrentDiagnosticStep(session.currentStepIndex);
  const option = currentStep.options?.find((item) => item.id === optionId);
  if (!option) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "目前步驟沒有這個選項。" } };
  }

  const trimmedDetail = detail?.trim();
  const updated: DiagnosticSession = {
    ...session,
    currentStepIndex: session.currentStepIndex + 1,
    lastSelectedOptionId: optionId,
    lastFreeTextDetail: trimmedDetail || undefined,
    lastPhotoFileName: photo?.name,
    lastPhotoSizeBytes: photo?.size,
    status: session.status === "OPEN" ? "IN_PROGRESS" : session.status,
    updatedAt: new Date().toISOString(),
  };
  writeStore(sessions.map((item) => (item.id === sessionId ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E07-S010 "Previous-step action". Moves `currentStepIndex` back by
 * exactly one and clears `lastSelectedOptionId`/`lastFreeTextDetail`
 * (plus, as of E07-S013 "Photo upload", `lastPhotoFileName`/
 * `lastPhotoSizeBytes` — same reasoning, a stale photo attachment is just
 * as much "what's recorded for the step being left" as the detail text
 * next to it) — the choice/detail/photo being left behind no longer
 * describes "what's recorded for the step the session is now showing", so
 * keeping them around would let a stale answer linger after the user has
 * explicitly asked to reconsider it. `status` is deliberately left untouched: once a
 * session has genuinely reached "IN_PROGRESS" (a real diagnostic action
 * happened), going back to reconsider that action isn't "back to not
 * started" — same reasoning selectDecisionOption's own doc comment gives
 * for never downgrading status on an already-advanced session.
 *
 * Fails closed with NOT_FOUND for an unknown `sessionId` — same
 * `readStore().find(...)` precedent every other lookup in this file
 * already follows.
 *
 * Fails closed with VALIDATION_ERROR when `currentStepIndex` is already
 * 0 — there is no step before the first one; same "reject rather than
 * silently clamp/no-op" discipline selectDecisionOption's own repeat-
 * guard already follows. Not reachable through the real UI at all
 * (current-step-card.tsx only renders the 上一步 button when
 * `step.stepIndex > 0`), same "structural, not just client-hidden"
 * precedent selectDecisionOption's own doc comment already cites.
 *
 * Going back does NOT re-run any option validation against the step
 * being returned to — `currentStepIndex - 1` always points at a step
 * this same session already passed through once, so it is guaranteed to
 * exist (see diagnostic-steps.ts's own DIAGNOSTIC_STEPS array), unlike
 * selectDecisionOption's `optionId`, which is arbitrary caller input.
 */
export async function goToPreviousStep(sessionId: string): Promise<Result<DiagnosticSession, ApiError>> {
  const sessions = readStore();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個診斷 session。" } };
  }

  if (session.currentStepIndex === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "已經是第一步。" } };
  }

  const updated: DiagnosticSession = {
    ...session,
    currentStepIndex: session.currentStepIndex - 1,
    lastSelectedOptionId: undefined,
    lastFreeTextDetail: undefined,
    lastPhotoFileName: undefined,
    lastPhotoSizeBytes: undefined,
    updatedAt: new Date().toISOString(),
  };
  writeStore(sessions.map((item) => (item.id === sessionId ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E07-S011 "Restart diagnostic". A session-level action, not a step-level
 * one like goToPreviousStep/selectDecisionOption — it resets the entire
 * session back to the exact state createDiagnosticSession itself produces
 * (`currentStepIndex` 0, `status` "OPEN", `lastSelectedOptionId`/
 * `lastFreeTextDetail`/`lastPhotoFileName`/`lastPhotoSizeBytes` (E07-S013)
 * all cleared), unlike goToPreviousStep, which only ever
 * moves one step and deliberately leaves `status` alone (see that
 * function's own doc comment). Restart's whole point is "forget what
 * happened, start over" — status genuinely does return to "not yet
 * progressed" here, the one case in this file where that's correct.
 *
 * No `currentStepIndex === 0` guard the way goToPreviousStep has one —
 * restarting an already-fresh session is a harmless no-op success, not an
 * error; unlike "go back past the first step" (which has no valid target
 * to move to), "start over" is always a coherent request regardless of
 * where the session currently is. Deliberately no confirmation-dialog
 * requirement here: this is Team A mock local state, not an irreversible
 * business action, and E07-S017 "Confirmation" is its own later story for
 * whichever action actually needs one — adding a confirmation step here
 * would be reaching into that story's own scope.
 *
 * Fails closed with NOT_FOUND for an unknown `sessionId` — same
 * `readStore().find(...)` precedent every other lookup in this file
 * already follows.
 */
export async function restartDiagnosticSession(sessionId: string): Promise<Result<DiagnosticSession, ApiError>> {
  const sessions = readStore();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個診斷 session。" } };
  }

  const updated: DiagnosticSession = {
    ...session,
    currentStepIndex: 0,
    status: "OPEN",
    lastSelectedOptionId: undefined,
    lastFreeTextDetail: undefined,
    lastPhotoFileName: undefined,
    lastPhotoSizeBytes: undefined,
    updatedAt: new Date().toISOString(),
  };
  writeStore(sessions.map((item) => (item.id === sessionId ? updated : item)));
  return { ok: true, value: updated };
}

/**
 * E07-S012 "Skip-step UX with reason" (epic's own fuller title — the
 * "with reason" is not decorative: unlike selectDecisionOption's optional
 * `detail`, `reason` here is mandatory, rejected with VALIDATION_ERROR
 * when empty/whitespace-only after trim). Advances `currentStepIndex` by
 * exactly one — same flat, non-branching movement as selectDecisionOption,
 * never a shadow implementation of Team B's DecisionEdge algorithm (see
 * diagnostic-steps.ts's own top doc comment) — but records NO option
 * (`lastSelectedOptionId` stays cleared): a skip is explicitly "no choice
 * was made", not a disguised third option. Also clears any stale
 * `lastFreeTextDetail`/`lastPhotoFileName`/`lastPhotoSizeBytes` (E07-S013)
 * from a prior real answer, since neither concept applies to a skip — not
 * independently reachable in today's 2-step model (same "not reachable,
 * but proves the field-clearing logic itself is unconditional" caveat this
 * file's own existing test for `lastFreeTextDetail` already notes), but
 * kept unconditional here for the same reason. First successful call flips a fresh "OPEN" session
 * to "IN_PROGRESS", same rule selectDecisionOption already follows — a
 * skip is still a real diagnostic action, just one that explicitly
 * declines to answer.
 *
 * Fails closed with NOT_FOUND for an unknown `sessionId` — same
 * `readStore().find(...)` precedent every other lookup in this file
 * already follows.
 *
 * Fails closed with VALIDATION_ERROR — sharing the code with two other
 * distinct conditions, same "both are 'this call doesn't make sense right
 * now'" reasoning selectDecisionOption's own doc comment already gives
 * for its own two VALIDATION_ERROR cases:
 *   1. `reason` is empty or whitespace-only — mandatory, unlike
 *      selectDecisionOption's `detail`.
 *   2. `session.currentStepIndex` no longer points at a step that HAS
 *      options — same repeat-guard shape selectDecisionOption's own
 *      guard follows: nothing to skip once the decision point is already
 *      behind the session (current-step-card.tsx only renders the skip
 *      UI when `step.options` is present, so this is structural, not
 *      just client-hidden).
 */
export async function skipDiagnosticStep(sessionId: string, reason: string): Promise<Result<DiagnosticSession, ApiError>> {
  const sessions = readStore();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個診斷 session。" } };
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請填寫略過原因。" } };
  }

  const currentStep = getCurrentDiagnosticStep(session.currentStepIndex);
  if (!currentStep.options || currentStep.options.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "目前步驟沒有可以略過的選項。" } };
  }

  const updated: DiagnosticSession = {
    ...session,
    currentStepIndex: session.currentStepIndex + 1,
    lastSelectedOptionId: undefined,
    lastFreeTextDetail: undefined,
    lastPhotoFileName: undefined,
    lastPhotoSizeBytes: undefined,
    lastSkipReason: trimmedReason,
    status: session.status === "OPEN" ? "IN_PROGRESS" : session.status,
    updatedAt: new Date().toISOString(),
  };
  writeStore(sessions.map((item) => (item.id === sessionId ? updated : item)));
  return { ok: true, value: updated };
}
