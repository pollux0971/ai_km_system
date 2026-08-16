"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { confirmErpQuery, getErpQuery, selectErpQueryScenario, type ErpQuerySummary } from "@/lib/erp-queries";
import { isAmbiguousErpQuery, matchErpScenarios } from "@/lib/erp-scenarios";

const logger = createLogger("web:erp-query-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; erpQuery: ErpQuerySummary };

/**
 * E09-S002 "Natural-language query composer" — the `/erp/[id]` route
 * NewErpQueryPage redirects to on a successful submission. E09-S006
 * loading, S007+ results are their own separate stories that grow what
 * this page shows further — same "don't invent a field/section ahead of
 * the story that owns it" discipline this codebase applies everywhere
 * else.
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
 * this query is considered ready for S006's own execution/loading step
 * (which doesn't exist yet — `confirmedAt` is as far as this story goes).
 * Deliberately does NOT let picking a scenario auto-confirm — the whole
 * point of a dedicated confirmation story is an explicit, separate
 * intent-to-execute gesture, not folding it into the selection click.
 * S003's own "picker replaced by the selected label, zero picker buttons
 * left" tests are scoped to the picker's own scenario buttons
 * specifically (see their own updated comments) rather than "zero
 * buttons of any kind" — this story's differently-purposed confirm
 * button legitimately coexists at that same point without those tests'
 * original intent actually changing.
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
          {erpQuery.confirmedAt ? (
            <p>查詢已確認，準備執行。</p>
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
