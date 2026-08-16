"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getErpQuery, selectErpQueryScenario, type ErpQuerySummary } from "@/lib/erp-queries";
import { matchErpScenarios } from "@/lib/erp-scenarios";

const logger = createLogger("web:erp-query-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; erpQuery: ErpQuerySummary };

/**
 * E09-S002 "Natural-language query composer" — the `/erp/[id]` route
 * NewErpQueryPage redirects to on a successful submission. E09-S004
 * clarification, S005 confirmation, S006 loading, S007+ results are
 * their own separate stories that grow what this page shows further —
 * same "don't invent a field/section ahead of the story that owns it"
 * discipline this codebase applies everywhere else.
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
        <p>查詢情境:{selectedScenario.label}</p>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <p>請選擇最符合您問題的查詢情境:</p>
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
