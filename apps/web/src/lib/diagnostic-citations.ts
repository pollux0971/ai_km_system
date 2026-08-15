import type { ApiError, Result } from "@ai-km/types";

/**
 * E07-S015 "SOP citation component". A genuinely separate design fork from
 * conversations/[id]/_components/message-content.tsx's own `[N]`-marker
 * citation mechanics (lib/citations.ts's `CitationSource`/`getCitationSource`)
 * — deliberately NOT mirrored here. That mechanism exists to disambiguate
 * WHICH claim within a multi-source, LLM-synthesized paragraph a citation
 * backs; a `DiagnosticStep.instruction` is one short, holistic sentence with
 * no sub-claims to disambiguate, so there is nothing for an embedded `[N]`
 * marker to usefully mark — and inventing one would mean editing
 * DIAGNOSTIC_STEPS' own already-approved instruction text that earlier
 * stories' own frozen tests already assert substrings of. Instead this
 * mirrors E07-S014 "AI explain-step panel" (this file's own direct sibling,
 * same component, one story earlier): a step-level, not sub-string-level,
 * relationship — "which SOP backs this step" — surfaced as its own toggle
 * panel, same shape as `diagnostic-explanations.ts`'s own
 * `explainDiagnosticStep`.
 *
 * `SopCitation`'s `snippet` field reuses citations.ts's own exact
 * "（模擬片段）" labeling convention verbatim (not a coincidence — citing an
 * excerpt is the one piece of vocabulary genuinely shared between both
 * citation concepts), while `title`/`section` are this file's own fields,
 * not a reuse of `CitationSource`'s `file`/`page` — an SOP is organized by
 * section, not page, and deserves its own honestly-named shape rather than
 * forcing a fit into a differently-scoped existing type. Static per-
 * `stepIndex` content, same "not a live generation, no artificial delay"
 * reasoning `diagnostic-explanations.ts`'s own doc comment already gives.
 */
export interface SopCitation {
  id: string;
  title: string;
  section: string;
  snippet: string;
}

const STEP_SOP_CITATIONS: Record<number, SopCitation> = {
  0: {
    id: "sop-diag-01",
    title: "（模擬 SOP）設備異常初步診斷標準作業程序",
    section: "第 2 節：異常現象記錄",
    snippet: "（模擬片段）操作人員應於發現異常時，記錄觀察到的聲音、燈號與錯誤訊息，作為後續判斷依據。",
  },
  1: {
    id: "sop-diag-02",
    title: "（模擬 SOP）設備異常初步診斷標準作業程序",
    section: "第 3 節：持續診斷程序",
    snippet: "（模擬片段）完成初步記錄後，診斷程序將依據記錄內容繼續進行後續判斷。",
  },
};

/**
 * Fails closed with NOT_FOUND for a `stepIndex` with no defined citation —
 * same defense-in-depth precedent `explainDiagnosticStep`'s own doc comment
 * describes: not reachable through the real UI (current-step-card.tsx only
 * ever passes `step.stepIndex`, already guaranteed valid by
 * getCurrentDiagnosticStep), structural rather than client-hidden.
 */
export async function getDiagnosticStepCitation(stepIndex: number): Promise<Result<SopCitation, ApiError>> {
  const citation = STEP_SOP_CITATIONS[stepIndex];
  if (!citation) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個步驟的 SOP 引用來源。" } };
  }
  return { ok: true, value: citation };
}
