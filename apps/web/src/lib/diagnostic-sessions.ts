import type { ApiError, Result } from "@ai-km/types";
import { getMaintenanceCase } from "./maintenance-cases";

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
 * Deliberately minimal: `status` and nothing about actual step/node
 * progress yet — E07-S007 "Current-step card" onward (mirroring E08-S10
 * "Node Transition") are their own later stories for real step content,
 * same "grow one field per story, don't reach into a later story's own
 * scope" discipline maintenance-cases.ts's own doc comments already
 * follow across S002-S005. A "shell" is the wrapping frame a session
 * lives inside, not the step-by-step interior S007+ will build.
 */
export interface DiagnosticSession {
  id: string;
  maintenanceCaseId: string;
  status: DiagnosticSessionStatus;
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
 * Starts a new session for a case, at status "OPEN" — the first,
 * not-yet-progressed pinned state, deliberately not "IN_PROGRESS":
 * this story's own scope is the shell itself, not real step
 * interaction, so nothing has actually progressed yet. E07-S007
 * onward is what will genuinely advance a session toward
 * "IN_PROGRESS" once real step content exists to progress through.
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
    createdAt: now,
    updatedAt: now,
  };
  writeStore([session, ...readStore()]);
  return { ok: true, value: session };
}
