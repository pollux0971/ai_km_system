import type { ApiError, Result } from "@ai-km/types";
import { getMaintenanceCase } from "./maintenance-cases";

/**
 * E07-S023 "Knowledge candidate submission". SOURCE_BASELINE lists this
 * story right alongside "E08-S20 Knowledge Candidate" (Team B,
 * Maintenance Intelligence Backend) — the same "E07 owns the frontend
 * action, E08 would own the backend processing/promotion pipeline"
 * relationship this whole epic already has with E08's real
 * DecisionSession/DecisionEvent entities (see diagnostic-sessions.ts's
 * own doc comment). Zero contracts exist yet under contracts/ for E08 at
 * all, so this is a local Team-A mock — same "local mock until the
 * owning domain's contract exists" precedent every other E07/E05 entity
 * in this codebase already follows.
 *
 * Deliberately its OWN entity, not a field bolted onto DiagnosticSession
 * — a knowledge candidate is conceptually a different thing (a
 * submission FOR the knowledge base, mirroring E08-S20's own name) from
 * a diagnostic session's own recorded answers, and SOURCE_BASELINE's own
 * naming keeps them as two distinct stories/entities on both the E07 and
 * E08 side. Also deliberately NOT a real KnowledgeBaseDocument
 * (E05-S011's own `addKnowledgeBaseDocumentFromText`) — "candidate"
 * means not-yet-reviewed/not-yet-published; directly creating a real
 * document here would silently skip whatever review/promotion step
 * E08-S20's own future backend is presumably for, which this file has no
 * visibility into and must not invent (Anti-hallucination Guard).
 *
 * One candidate per case, same "one session per case" MVP simplicity
 * precedent getDiagnosticSessionForCase's own doc comment already
 * establishes — submitKnowledgeCandidate's own repeat-guard rejects a
 * second submission for the same maintenanceCaseId rather than allowing
 * multiple, silently overwriting, or silently ignoring the second one.
 */
export interface KnowledgeCandidate {
  id: string;
  maintenanceCaseId: string;
  content: string;
  createdAt: string;
}

const STORAGE_KEY = "ai-km:mock-knowledge-candidates";

/** Same sessionStorage-backed reasoning as lib/diagnostic-sessions.ts's own readStore(). No seed data — a candidate only ever exists once submitted through this same story's own submitKnowledgeCandidate(). */
function readStore(): KnowledgeCandidate[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KnowledgeCandidate[];
  } catch {
    return [];
  }
}

function writeStore(items: KnowledgeCandidate[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * The current candidate for a given case, if one has been submitted —
 * same `value: T | null` shape getDiagnosticSessionForCase already
 * establishes for "the fetch itself succeeded; nothing has been
 * submitted yet." Always resolves `ok: true` — same "safe, always-
 * successful read, no validation to fail" shape as
 * getDiagnosticSessionForCase, deliberately including for an unknown
 * maintenanceCaseId (resolves `null`, not NOT_FOUND — checking whether
 * something exists for an id is not the same operation as requiring
 * that id's own parent to be real, which is submitCandidate's own job).
 */
export async function getKnowledgeCandidateForCase(maintenanceCaseId: string): Promise<Result<KnowledgeCandidate | null, ApiError>> {
  return { ok: true, value: readStore().find((item) => item.maintenanceCaseId === maintenanceCaseId) ?? null };
}

/**
 * Submits `content` as a knowledge candidate for `maintenanceCaseId`.
 * Fails closed with NOT_FOUND for an unknown maintenanceCaseId — same
 * `getMaintenanceCase` reuse precedent createDiagnosticSession's own doc
 * comment already establishes for its own maintenanceCaseId parameter.
 * Fails closed with VALIDATION_ERROR for an empty/whitespace-only
 * `content`, and again if a candidate already exists for this case (the
 * repeat-guard — see this file's own top doc comment for why this stays
 * one-per-case at MVP scope).
 */
export async function submitKnowledgeCandidate(maintenanceCaseId: string, content: string): Promise<Result<KnowledgeCandidate, ApiError>> {
  const caseResult = await getMaintenanceCase(maintenanceCaseId);
  if (!caseResult.ok) return caseResult;
  if (!caseResult.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個維修案例。" } };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請填寫候選內容。" } };
  }

  const existing = readStore();
  if (existing.some((item) => item.maintenanceCaseId === maintenanceCaseId)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "這個案例已經提交過知識候選。" } };
  }

  const candidate: KnowledgeCandidate = {
    id: crypto.randomUUID(),
    maintenanceCaseId,
    content: trimmedContent,
    createdAt: new Date().toISOString(),
  };
  writeStore([candidate, ...existing]);
  return { ok: true, value: candidate };
}
