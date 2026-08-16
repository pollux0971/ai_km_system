"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { confirmErpQuery, executeErpQuery, getErpQuery, selectErpQueryScenario, type ErpQuerySummary } from "@/lib/erp-queries";
import { isAmbiguousErpQuery, matchErpScenarios } from "@/lib/erp-scenarios";
import { simulateErpQueryExecution } from "@/lib/erp-execution";
import { getErpResultSummary } from "@/lib/erp-results";
import { getErpResultTable } from "@/lib/erp-result-tables";
import { paginateErpResultTable } from "@/lib/erp-result-table-pagination";
import { getErpResultKpi } from "@/lib/erp-result-kpis";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:erp-query-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; erpQuery: ErpQuerySummary };

/**
 * E09-S002 "Natural-language query composer" — the `/erp/[id]` route
 * NewErpQueryPage redirects to on a successful submission. E09-S008+
 * (result table, KPI card, chart, ...) are their own separate stories
 * that grow what this page shows further — same "don't invent a
 * field/section ahead of the story that owns it" discipline this
 * codebase applies everywhere else.
 *
 * E09-S003 "Query scenario selector" adds the picker below: once loaded,
 * matchErpScenarios(erpQuery.questionText) surfaces candidate whitelisted
 * scenarios (SOURCE_BASELINE pinned #21) as buttons; picking one calls
 * selectErpQueryScenario and replaces the picker with the chosen label —
 * same pick-once-then-show-the-result shape
 * current-step-card.tsx's own decision-option flow already establishes,
 * scoped to this page's own local state rather than a separate lib
 * "session" concept E09 doesn't have.
 *
 * E09-S004 "Clarification UI" swaps the picker's own prompt wording when
 * isAmbiguousErpQuery(erpQuery.questionText) — i.e. matchErpScenarios()
 * is showing its bare S003 fallback (every scenario, because none
 * genuinely matched) rather than a real match. This is intentionally
 * still the same picker, same options, same click handler — only the
 * prompt text changes; a more sophisticated clarifying flow (rephrasing,
 * follow-up questions) is explicitly out of this story's own MVP scope
 * (AC 8 allows simplifying the algorithm, not skipping the capability).
 *
 * E09-S005 "Query confirmation UI" adds one more gate once a scenario is
 * selected: a 確認執行查詢 button the user must explicitly click before
 * this query is considered ready to execute. Deliberately does NOT let
 * picking a scenario auto-confirm — the whole point of a dedicated
 * confirmation story is an explicit, separate intent-to-execute gesture,
 * not folding it into the selection click. S003's own "picker replaced
 * by the selected label, zero picker buttons left" tests are scoped to
 * the picker's own scenario buttons specifically (see their own updated
 * comments) rather than "zero buttons of any kind" — this story's
 * differently-purposed confirm button legitimately coexists at that same
 * point without those tests' original intent actually changing.
 *
 * E09-S006 "Query loading state": once `confirmedAt` is set and
 * `executedAt` isn't, a useEffect automatically starts execution — no
 * extra click. Confirming already IS the user's intent-to-execute
 * gesture (S005's own reasoning above); requiring a second explicit
 * "now actually run it" action would just be redundant friction, not a
 * genuinely different decision point. This makes S005's own original
 * "查詢已確認,準備執行。" resting message transient rather than a state a
 * user could ever actually observe held still, so it's removed — S005's
 * own two tests that asserted it are updated/removed accordingly (full
 * reasoning in docs/stories/E09-S006.md, self-adopted as a single-story,
 * low-risk, fully reversible UX decision per STORY_WORKFLOW's own
 * "advisor Step 4" self-adoption criteria).
 *
 * This is the first mutation in E09's own flow that touches something
 * SOURCE_BASELINE pinned #22 ("SQL execution must be audited") actually
 * cares about (even though execution itself is still simulated, not a
 * real SELECT) — S002/S003/S005 all judged their own equivalent AC as
 * N/A because nothing before this point does anything resembling data
 * access. trackEvent (this codebase's own established E14 stand-in —
 * see telemetry.ts's own doc comment, and E05-S006/E07-S022's own
 * precedent for using it as the interim audit channel) fires
 * attempt/success/failure around the execution, payload limited to
 * `erpQueryId`/`scenarioId` (fixed-vocabulary, same category as
 * errorCode) — never `questionText`, same free-form-content restraint
 * every other telemetry call in this epic already keeps.
 *
 * E09-S007 "Text summary" adds getErpResultSummary(erpQuery.
 * selectedScenarioId) once `executedAt` is set — purely additive next to
 * S006's own "查詢已執行完成。" status line, not a replacement: unlike
 * S005→S006 (where the "confirmed, ready" state became genuinely
 * unobservable), the "executed, done" state stays a real, valid resting
 * state a user can see — this story only enriches it with content, so
 * none of S006's own tests needed to change. Judged AC7 N/A: displaying
 * an already-executed, already-audited result isn't itself a new
 * sensitive operation, same "the mutation gets audited, not every
 * subsequent render of its outcome" reasoning implicit in every other
 * read-only render in this codebase.
 *
 * E09-S008 "Result table" adds getErpResultTable(erpQuery.
 * selectedScenarioId) as a semantic `<table>`, additive next to S007's
 * own summary text for the same reason S007 itself was additive to
 * S006 — the "executed, done" state keeps growing richer content, it
 * never needs an existing test to change. (Originally rendered the whole
 * table at once with no pagination; E09-S009, directly below, adds that.)
 *
 * E09-S009 "Server pagination UI" wraps the table body in
 * paginateErpResultTable (client-side slicing over the already-loaded
 * mock table — see erp-result-table-pagination.ts's own doc comment for
 * why the page size is deliberately small). This narrows S008's own
 * "every cell visible at once" test to "page 1's own cells visible at
 * once" — a later story's new capability legitimately making an earlier
 * approved test's precondition stale, same category of change S005→S006
 * already established precedent for in this same file, documented in
 * docs/stories/E09-S009.md.
 *
 * E09-S010 "KPI card" adds getErpResultKpi(erpQuery.selectedScenarioId)
 * between the summary and the table — a single derived headline number
 * (the table's own total row count, not a hand-typed duplicate of it;
 * see erp-result-kpis.ts's own doc comment for why, tying back to the
 * cross-file drift E09-S008's own independent review caught). Purely
 * additive, no existing test needed to change.
 *
 * Deliberately does NOT retrofit ErpQueryList (S001) into linking here,
 * same self-adopted scope boundary CaseDetail (E07-S021) already
 * documents for MaintenanceCaseList — ErpQueryList's own "renders no
 * links" test already asserts exactly zero links, and turning items
 * into links would flip that assertion's truth value, which doesn't fit
 * the narrow test-freeze exception (add interaction steps, keep
 * assertions unchanged).
 */
export default function ErpQueryDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [executionError, setExecutionError] = useState(false);
  const [tablePage, setTablePage] = useState(1);

  async function handleSelectScenario(scenarioId: string) {
    if (selectionPending) return;

    const correlationId = crypto.randomUUID();
    setSelectionPending(true);
    setSelectionError(false);
    logger.info("selecting ERP query scenario", { correlationId, id, scenarioId });

    const result = await selectErpQueryScenario(id, scenarioId);
    setSelectionPending(false);

    if (!result.ok) {
      logger.error("failed to select ERP query scenario", { correlationId, id, code: result.error.code });
      setSelectionError(true);
      return;
    }

    logger.info("ERP query scenario selected", { correlationId, id, scenarioId });
    setState({ status: "loaded", erpQuery: result.value });
  }

  async function handleConfirm() {
    if (confirmPending) return;

    const correlationId = crypto.randomUUID();
    setConfirmPending(true);
    setConfirmError(false);
    logger.info("confirming ERP query", { correlationId, id });

    const result = await confirmErpQuery(id);
    setConfirmPending(false);

    if (!result.ok) {
      logger.error("failed to confirm ERP query", { correlationId, id, code: result.error.code });
      setConfirmError(true);
      return;
    }

    logger.info("ERP query confirmed", { correlationId, id });
    setState({ status: "loaded", erpQuery: result.value });
  }

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading ERP query detail", { correlationId, id });

    getErpQuery(id).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load ERP query", { correlationId, id, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("ERP query not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      logger.info("ERP query detail loaded", { correlationId, id });
      setState({ status: "loaded", erpQuery: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (state.status !== "loaded") return;
    const { erpQuery } = state;
    if (!erpQuery.confirmedAt || erpQuery.executedAt) return;

    let cancelled = false;
    const correlationId = crypto.randomUUID();
    setExecutionError(false);
    logger.info("executing ERP query", { correlationId, id });
    trackEvent("erp_query_execute_attempt", {
      correlationId,
      properties: { erpQueryId: id, scenarioId: erpQuery.selectedScenarioId },
    });

    (async () => {
      await simulateErpQueryExecution();
      const result = await executeErpQuery(id);
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to execute ERP query", { correlationId, id, code: result.error.code });
        trackEvent("erp_query_execute_failure", { correlationId, properties: { erpQueryId: id, code: result.error.code } });
        setExecutionError(true);
        return;
      }

      logger.info("ERP query executed", { correlationId, id });
      trackEvent("erp_query_execute_success", { correlationId, properties: { erpQueryId: id } });
      setState({ status: "loaded", erpQuery: result.value });
    })();

    return () => {
      cancelled = true;
    };
  }, [state, id]);

  if (state.status === "loading") {
    return (
      <main style={{ padding: 32 }}>
        <LoadingIndicator />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法載入 ERP 查詢。" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage code="NOT_FOUND" />
      </main>
    );
  }

  const { erpQuery } = state;
  const selectedScenario = erpQuery.selectedScenarioId
    ? matchErpScenarios(erpQuery.questionText).find((option) => option.id === erpQuery.selectedScenarioId) ??
      { label: erpQuery.selectedScenarioId }
    : undefined;

  return (
    <main style={{ padding: 32 }}>
      <h1>{erpQuery.questionText}</h1>
      <p>
        <time dateTime={erpQuery.createdAt}>{new Date(erpQuery.createdAt).toLocaleString("zh-TW")}</time>
      </p>
      {selectedScenario ? (
        <div style={{ marginBottom: 16 }}>
          <p>查詢情境:{selectedScenario.label}</p>
          {erpQuery.executedAt ? (
            <>
              <p>查詢已執行完成。</p>
              <p>{getErpResultSummary(erpQuery.selectedScenarioId ?? "")}</p>
              {(() => {
                const kpi = getErpResultKpi(erpQuery.selectedScenarioId ?? "");
                return (
                  <div role="group" aria-label="關鍵指標">
                    <p>{kpi.label}</p>
                    <p>{kpi.value}</p>
                  </div>
                );
              })()}
              {(() => {
                const paginated = paginateErpResultTable(getErpResultTable(erpQuery.selectedScenarioId ?? ""), tablePage);
                return (
                  <>
                    <table>
                      <thead>
                        <tr>
                          {paginated.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {paginated.totalPages > 1 && (
                      <nav aria-label="查詢結果分頁">
                        <button
                          type="button"
                          onClick={() => setTablePage((current) => current - 1)}
                          disabled={paginated.page <= 1}
                        >
                          上一頁
                        </button>
                        <span>
                          第 {paginated.page} 頁，共 {paginated.totalPages} 頁
                        </span>
                        <button
                          type="button"
                          onClick={() => setTablePage((current) => current + 1)}
                          disabled={paginated.page >= paginated.totalPages}
                        >
                          下一頁
                        </button>
                      </nav>
                    )}
                  </>
                );
              })()}
            </>
          ) : erpQuery.confirmedAt ? (
            executionError ? (
              <ErrorMessage message="無法執行查詢，請稍後再試。" />
            ) : (
              <>
                <LoadingIndicator />
                <p>執行中…</p>
              </>
            )
          ) : (
            <>
              <button type="button" onClick={handleConfirm} disabled={confirmPending}>
                確認執行查詢
              </button>
              {confirmError && (
                <div style={{ marginTop: 8 }}>
                  <ErrorMessage message="無法確認查詢，請稍後再試。" />
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <p>
            {isAmbiguousErpQuery(erpQuery.questionText)
              ? "我們無法確定您的問題屬於哪個查詢情境，請從以下選項中選擇最接近的，或換個方式描述您的問題:"
              : "請選擇最符合您問題的查詢情境:"}
          </p>
          {matchErpScenarios(erpQuery.questionText).map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => handleSelectScenario(scenario.id)}
              disabled={selectionPending}
              style={{ marginRight: 8, marginBottom: 8 }}
            >
              {scenario.label}
            </button>
          ))}
          {selectionError && (
            <div style={{ marginTop: 8 }}>
              <ErrorMessage message="無法選擇查詢情境，請稍後再試。" />
            </div>
          )}
        </div>
      )}
      <p>
        <Link href="/erp">返回 ERP 助手首頁</Link>
      </p>
    </main>
  );
}
