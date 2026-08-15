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
 * recently picked; `undefined` until the first selection). Both are
 * plain, Team-A-owned progress markers — not a guess at E08's real
 * `DecisionSession`/`DecisionEvent` shape (E08-S08/S09, Team B; zero
 * contracts exist yet under contracts/ for either), and not a graph
 * position: `currentStepIndex` only ever advances one flat step at a time
 * via selectDecisionOption below, never branches (see
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
 */
export async function selectDecisionOption(sessionId: string, optionId: string): Promise<Result<DiagnosticSession, ApiError>> {
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

  const updated: DiagnosticSession = {
    ...session,
    currentStepIndex: session.currentStepIndex + 1,
    lastSelectedOptionId: optionId,
    status: session.status === "OPEN" ? "IN_PROGRESS" : session.status,
    updatedAt: new Date().toISOString(),
  };
  writeStore(sessions.map((item) => (item.id === sessionId ? updated : item)));
  return { ok: true, value: updated };
}
