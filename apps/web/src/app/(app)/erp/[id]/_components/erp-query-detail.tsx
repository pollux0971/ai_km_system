"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { confirmErpQuery, executeErpQuery, getErpQuery, selectErpQueryScenario, type ErpQuerySummary } from "@/lib/erp-queries";
import { isAmbiguousErpQuery, matchErpScenarios } from "@/lib/erp-scenarios";
import { simulateErpQueryExecution } from "@/lib/erp-execution";
import { getErpResultSummary } from "@/lib/erp-results";
import { getErpResultTable, type ErpResultTable } from "@/lib/erp-result-tables";
import { paginateErpResultTable } from "@/lib/erp-result-table-pagination";
import { getErpResultKpi } from "@/lib/erp-result-kpis";
import { getErpResultChart } from "@/lib/erp-result-charts";
import { getAppliedFilterLabel } from "@/lib/erp-applied-filters";
import { erpResultTableToCsv } from "@/lib/erp-result-export";
import { simulateErpExportProgress } from "@/lib/erp-export-progress";
import { ERP_PREDICTION_HORIZONS } from "@/lib/erp-prediction-horizons";
import { getErpPrediction } from "@/lib/erp-predictions";
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
 * E09-S011 "Chart renderer" adds a hand-rolled, dependency-free
 * horizontal bar chart between the KPI card and the table (no charting
 * library exists anywhere in this codebase — see erp-result-charts.ts's
 * own doc comment). Bar labels/details are the table's own row cells
 * shown verbatim, never a re-derived number. Purely additive, no
 * existing test needed to change.
 *
 * E09-S012 "Applied-filter display" adds one more line right next to
 * "查詢情境:{label}" — not a duplicate (that shows *which* scenario;
 * this shows *why*, via getAppliedFilterLabel's own keyword-match
 * reasoning, see its own doc comment). Shown as soon as a scenario is
 * selected, not gated on execution — it explains the AI's scenario
 * choice, independent of whether results exist yet. Purely additive.
 *
 * E09-S013 "Data freshness badge" adds one more line right after "查詢
 * 已執行完成。" — this mock has no real ERP backend sync process to
 * report a freshness timestamp from, so the only honest "as of" moment
 * is this query's own executedAt, formatted the identical way
 * erpQuery.createdAt already is above (same `<time dateTime=...>`
 * pattern — neither one has ever needed its own lib file, this being
 * a bare Date/toLocaleString call with no derivation logic to unit-test
 * in isolation). Gated on executedAt like S007-S011 (a freshness claim
 * only means something once a result actually exists), unlike S012's
 * own applied-filter line just above. Purely additive.
 *
 * E09-S014 "Source-system badge" adds one more constant line right
 * after the freshness badge — a literal, hand-typed string, not derived
 * from anything on erpQuery. Checked before writing this: neither
 * SOURCE_BASELINE.md nor this epic's own file ever names a specific ERP
 * product (no "SAP"/"Oracle"/etc. anywhere), and pinned decisions #19-21
 * only ever describe "ERP" singular + "whitelist view" (plural views,
 * one system) — this MVP has exactly one (simulated) data source, not
 * several, so the badge is identical for every scenario rather than
 * scenario-derived. Gated on executedAt like S013 (both describe the
 * result's own provenance). Purely additive.
 *
 * E09-S016 "Excel export action" adds one more line right after the
 * table/pagination block: originally a plain `<a download href="data:
 * text/csv;...">` (S017, directly below, turns this into a button that
 * builds and clicks that same kind of anchor programmatically once its own
 * simulated delay completes — the CSV-building/escaping design below is
 * unchanged by that, only the trigger mechanism is), mirroring
 * maintenance-report.tsx's own casesToCsv precedent (E07-S022 —
 * still the only export/download feature in this codebase; its own doc
 * comment confirms nothing shared was ever extracted from it, so
 * erp-result-export.ts is a fresh, bespoke copy of the same CSV-escaping
 * shape rather than a cross-epic import). Labeled "匯出 Excel" (this
 * story's own name/intent), not "匯出 CSV" (E07-S022's own literal
 * label) — the underlying file is CSV, but AC8 explicitly allows
 * simplifying the algorithm as long as the capability itself isn't
 * absent, a real xlsx-generation dependency exists nowhere in this
 * monorepo (checked before writing this, same discipline S011's own doc
 * comment already applies to charting libraries), and a CSV file is
 * genuinely Excel-openable — the filename itself stays honestly
 * `erp-query-result.csv`, only the visible label states the product
 * intent. Exports getErpResultTable's own full, un-paginated table (not
 * paginateErpResultTable's current-page slice) — an export is expected to
 * hold the whole result set regardless of which page happens to be on
 * screen. Gated on executedAt like S007-S014 (nothing to export before a
 * result exists). Telemetry fires around the click (see S017 below for
 * its exact attempt/success shape), same "closest thing to a sensitive
 * operation this page has, a real artifact leaves the browser" reasoning
 * maintenance-report.tsx's own doc comment already gives for its own
 * equivalent event — payload stays `erpQueryId`/`scenarioId`/`rowCount`
 * only, same free-form-text restraint every other telemetry call in this
 * file already keeps.
 *
 * E09-S017 "Export progress" turns S016's originally-instant, always-ready
 * link into a `<button>` + `exportPending` state: clicking calls
 * simulateErpExportProgress (erp-export-progress.ts — same "own tiny delay
 * primitive in its own file" shape as erp-execution.ts's own execution
 * delay), showing a 匯出中… line (same LoadingIndicator this file already
 * uses for 執行中…) while it runs, then builds the CSV href, creates a
 * detached `<a download>`, appends+clicks+removes it to trigger the real
 * download, and returns to the button — the same auto-transition shape
 * S006 already established for query execution (no second click needed
 * once started). A standing, always-rendered `<a>` (S016's original
 * shape) has no way to represent a "pending" state, which is why the
 * trigger mechanism — not the CSV-building logic itself — is what
 * changes here. Telemetry splits into `erp_query_export_attempt`/
 * `_success` sharing one correlationId (S016's single, click-time-only
 * `erp_query_export` no longer fits now that there's a genuine start and
 * end to represent — same reasoning `erp_query_execute_attempt`/
 * `_success` already follow for query execution above). The simulated
 * delay always succeeds (a timing primitive, not a real operation that
 * can fail — same as erp-execution.ts's own "Always succeeds" doc
 * comment), so there is no corresponding `_failure` event.
 *
 * E09-S018 "Prediction scenario selector" adds an "AI 預測" button group
 * right after the export block: SOURCE_BASELINE names "Prediction" as
 * one capability alongside Table/KPI/Chart/Excel Export, but pins
 * nothing about what gets predicted or how, and — unlike
 * ERP_SCENARIO_OPTIONS — never names a second, separate "prediction
 * scenario" business taxonomy anywhere in the spec baseline (checked
 * before writing this: SOURCE_BASELINE.md, this epic file, docs/adr/,
 * TRACEABILITY.md, readme_zh.md all zero-hit anything more specific than
 * the bare story titles). Reading this story's own "scenario" as "which
 * selectable option" rather than a second business-area re-selection:
 * ERP_PREDICTION_HORIZONS (erp-prediction-horizons.ts) is a fixed set of
 * *time horizons* (下月/下季/下年) for the query's own already-selected
 * business scenario, not a competing whitelist. Pure local component
 * state (`predictionHorizonId`), not a persisted field on ErpQuerySummary
 * or a call through erp-queries.ts — same "tablePage" precedent (E09-S009)
 * for a display selection with no real backend mutation behind it, unlike
 * S003's own selectErpQueryScenario (a genuine, audited state change).
 * Behaves as a freely-switchable toggle group (`aria-pressed`), not
 * S003's own one-way "picker replaced by the resolved label" shape — S003
 * commits to something with real consequences (which SQL view runs);
 * switching horizons here has none, so there's no reason to lock it in.
 * `handleSelectPredictionHorizon` no-ops on re-clicking the
 * already-pressed horizon, both to avoid a redundant telemetry
 * `erp_prediction_horizon_selected` event and to keep this consistent
 * with AC5's "no undefined duplicate side effect" even though a plain
 * `setState` call couldn't meaningfully "duplicate" on its own. Gated on
 * executedAt like every other section since S007, for the same
 * "nothing to predict from before a result exists" reasoning. S019
 * "Prediction result" and S020 "Prediction disclaimer" are their own
 * separate, later stories — this one only owns the selection UI, same
 * "don't invent the next story's own capability" restraint S008 already
 * applied to S009's pagination.
 *
 * E09-S019 "Prediction result" adds one more line inside the "AI 預測"
 * group, right after the horizon buttons: getErpPrediction's own text,
 * shown once predictionHorizonId is set (nothing to predict before a
 * horizon is chosen). Reuses selectedScenario's own already-computed
 * label — same single-source-of-truth discipline every other line in
 * this file already follows — rather than re-deriving or hand-typing it
 * again. Unlike S018's own render change, this adds no new button, so
 * S006's own "no leftover buttons" assertion needed no further update.
 *
 * E09-S020 "Prediction disclaimer" adds one more constant line right
 * after S019's own prediction text, gated the same way (nothing to
 * disclaim before a prediction exists). A literal, hand-typed string —
 * same "no derivation logic worth its own lib file" reasoning S013/S014
 * already established for their own bare constants — using the exact
 * `（模擬X）...正式版本中，...目前為前端固定文字` labeling convention
 * `diagnostic-explanations.ts` (E07-S014) already establishes for
 * honestly disclosing simulated AI-shaped content elsewhere in this
 * codebase, rather than inventing a new disclosure style. Identical for
 * every horizon (same reasoning S014's own source-system badge already
 * gives for being scenario-invariant) — there's nothing horizon-specific
 * to disclaim differently.
 *
 * E09-S021 "ERP error UX" fixes two genuine dead-ends found by auditing
 * every error state in this file: the initial query-load effect and the
 * execution effect both only ever run once (their own dependency arrays
 * — `[id]` and `[state, id]` respectively — never change again after a
 * failure, since neither failure branch calls `setState` on the query
 * itself), so before this story a load or execution failure was
 * unrecoverable without a full page reload. `loadAttempt`/
 * `executionAttempt` are pure "force this effect to run again" counters
 * (no meaning of their own beyond identity), added to each effect's own
 * dependency array; a 重試 button bumps the relevant one. Deliberately
 * NOT a separate component with its own pending/error state mirroring
 * `KnowledgeDocumentRetryButton` (E05-S021) — that component's pattern
 * fits its own situation (a genuinely distinct retry mutation, no other
 * visible re-triggerable action), but re-triggering the *exact same*
 * effect that already owns full error handling and (for execution)
 * telemetry is a smaller, less duplicative change here, and keeps the
 * same "swap the whole view on state transition" shape this file already
 * uses everywhere else (confirm→執行中…, 匯出→匯出中…) rather than mixing
 * in a second, differently-shaped "disabled + relabeled button" pattern
 * for just these two states. The query-load effect now also resets
 * `state` to `{status: "loading"}` at its own top (previously implicit
 * only on first mount, since that was the initial state) — this is what
 * makes a retry click show the loading view immediately, the same way
 * the execution effect's own pre-existing `setExecutionError(false)` at
 * its top already did for execution retries, needing no new logic there.
 * Retrying execution re-fires the *same* `erp_query_execute_attempt`/
 * `_success`/`_failure` telemetry the original attempt already used
 * (fresh correlationId each run) rather than inventing separate
 * `_retry_*` event names — SOURCE_BASELINE pinned #22 cares that SQL
 * execution is audited, not that a human reading the trail can label
 * which attempt number a given event was, and every attempt already gets
 * its own distinct correlationId regardless. The query-load retry stays
 * logger-only, deliberately not trackEvent'd — consistent with the
 * *original* (non-retry) load already being logger-only (S002's own
 * doc comment above judges reads generally N/A for AC7-style audit
 * requirements); retrying a plain read shouldn't newly require an
 * audit trail its own non-retried counterpart never needed.
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [executionAttempt, setExecutionAttempt] = useState(0);
  const [tablePage, setTablePage] = useState(1);
  const [exportPending, setExportPending] = useState(false);
  const [predictionHorizonId, setPredictionHorizonId] = useState<string | undefined>(undefined);

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

  async function handleExportClick(scenarioId: string | undefined, table: ErpResultTable) {
    if (exportPending) return;

    const correlationId = crypto.randomUUID();
    setExportPending(true);
    trackEvent("erp_query_export_attempt", {
      correlationId,
      properties: { erpQueryId: id, scenarioId },
    });

    await simulateErpExportProgress();

    const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${erpResultTableToCsv(table)}`)}`;
    const link = document.createElement("a");
    link.href = csvHref;
    link.download = "erp-query-result.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    trackEvent("erp_query_export_success", {
      correlationId,
      properties: { erpQueryId: id, scenarioId, rowCount: table.rows.length },
    });
    setExportPending(false);
  }

  function handleSelectPredictionHorizon(horizonId: string) {
    if (predictionHorizonId === horizonId) return;

    const correlationId = crypto.randomUUID();
    setPredictionHorizonId(horizonId);
    trackEvent("erp_prediction_horizon_selected", {
      correlationId,
      properties: { erpQueryId: id, horizonId },
    });
  }

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    setState({ status: "loading" });
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
  }, [id, loadAttempt]);

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
  }, [state, id, executionAttempt]);

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
        <p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            重試
          </button>
        </p>
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
          <p>{getAppliedFilterLabel(erpQuery.selectedScenarioId ?? "", erpQuery.questionText)}</p>
          {erpQuery.executedAt ? (
            <>
              <p>查詢已執行完成。</p>
              <p>
                資料更新時間：<time dateTime={erpQuery.executedAt}>{new Date(erpQuery.executedAt).toLocaleString("zh-TW")}</time>
              </p>
              <p>資料來源系統：模擬 ERP 系統(MVP,唯讀)</p>
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
                const chart = getErpResultChart(erpQuery.selectedScenarioId ?? "");
                return (
                  <div role="group" aria-label="結果圖表">
                    {chart.bars.map((bar) => (
                      <div key={bar.label}>
                        <p>{bar.label}</p>
                        <div style={{ width: `${bar.widthPercent}%`, height: 8, background: "currentColor" }} />
                        <p>{bar.detail}</p>
                      </div>
                    ))}
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
              {(() => {
                const table = getErpResultTable(erpQuery.selectedScenarioId ?? "");
                return exportPending ? (
                  <>
                    <LoadingIndicator />
                    <p>匯出中…</p>
                  </>
                ) : (
                  <p>
                    <button type="button" onClick={() => handleExportClick(erpQuery.selectedScenarioId, table)}>
                      匯出 Excel
                    </button>
                  </p>
                );
              })()}
              <div role="group" aria-label="AI 預測">
                <p>選擇預測時間範圍:</p>
                {ERP_PREDICTION_HORIZONS.map((horizon) => (
                  <button
                    key={horizon.id}
                    type="button"
                    onClick={() => handleSelectPredictionHorizon(horizon.id)}
                    aria-pressed={predictionHorizonId === horizon.id}
                    style={{ marginRight: 8 }}
                  >
                    {horizon.label}
                  </button>
                ))}
                {predictionHorizonId && (
                  <>
                    <p>{getErpPrediction(selectedScenario?.label ?? "", predictionHorizonId)}</p>
                    <p>
                      （模擬預測）此預測套用固定的簡化成長率假設，並非真實財務預測或對未來表現的保證，正式版本中將由實際的預測模型產生。
                    </p>
                  </>
                )}
              </div>
            </>
          ) : erpQuery.confirmedAt ? (
            executionError ? (
              <>
                <ErrorMessage message="無法執行查詢，請稍後再試。" />
                <p>
                  <button type="button" onClick={() => setExecutionAttempt((attempt) => attempt + 1)}>
                    重試
                  </button>
                </p>
              </>
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
