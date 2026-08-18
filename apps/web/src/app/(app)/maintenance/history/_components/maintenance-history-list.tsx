"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listMaintenanceCases, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSessionStatus } from "@/lib/diagnostic-sessions";

const logger = createLogger("web:maintenance-history-list");

/** Same 5-value label set maintenance-session.tsx's own SESSION_STATUS_LABELS already defines — duplicated locally rather than imported across routes, same "small enough that a shared import isn't worth the coupling" precedent formatFileSize's own 3 independent copies already establish in this codebase. */
const SESSION_STATUS_LABELS: Record<DiagnosticSessionStatus, string> = {
  OPEN: "待處理",
  IN_PROGRESS: "進行中",
  RESOLVED: "已解決",
  ESCALATED: "已升級",
  CANCELLED: "已取消",
};

interface HistoryItem {
  maintenanceCase: MaintenanceCaseSummary;
  status: DiagnosticSessionStatus | null;
  completionSummary?: string;
  escalationReason?: string;
}

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; items: HistoryItem[] };

/**
 * E07-S020 "Maintenance history". Distinct from E07-S001's own
 * MaintenanceCaseList (which lists cases as a starting/resuming
 * dashboard and has never shown diagnostic status at all — see that
 * component's own doc comment) — this is the cross-case REVIEW view:
 * every case, enriched with what actually happened to it. A different
 * shape from E03-S022 "Conversation history pagination" — that story's
 * own title (unlike this one's) explicitly names pagination, and it's
 * the only pagination story anywhere in E03; E07's own 25-story list has
 * no pagination story at all, so this reuses listMaintenanceCases() as
 * -is, same "don't invent a parameter this story doesn't ask for"
 * discipline that function's own doc comment already establishes for
 * search.
 *
 * Enrichment composes two already-existing, already-approved read
 * functions — listMaintenanceCases() (E07-S001) and
 * getDiagnosticSessionForCase() (E07-S006) — same "component combines
 * two lib calls into one loaded state" precedent maintenance-session.tsx
 * already established for getMaintenanceCase +
 * getDiagnosticSessionForCase. No new lib function, no new contract.
 *
 * `status: null` (no session exists yet for that case — the user
 * created it but never opened its diagnostic session) renders no status
 * line at all, same "absence means nothing to show" precedent this
 * whole codebase already follows for every other optional field.
 * RESOLVED additionally shows `摘要:` + `lastCompletionSummary`
 * (E07-S019), ESCALATED additionally shows `原因:` +
 * `lastEscalationReason` (E07-S018) — both already-recorded values,
 * simply surfaced here, never re-derived. Each gets its own label
 * (unlike this file's first draft, which rendered both as bare,
 * unlabeled spans) — same "recorded value gets a distinguishing label,
 * not a bare span" precedent current-step-card.tsx's own "已升級此案例,
 * 原因:"/"已解決此案例,摘要:" already establishes; without a label, a
 * completion summary and an escalation reason are visually
 * indistinguishable free text, and (worse) a field-mixup bug between
 * the two would render identically either way.
 *
 * If ANY per-case session lookup fails, the whole page shows the error
 * state rather than a partially-enriched list — same "partial success
 * must not be mislabeled as full success" reasoning the Failure/Fallback
 * Boundary's own "不得標為完整成功" rule states; a mixed
 * some-rows-enriched/some-rows-silently-blank list would be exactly that
 * kind of mislabeling.
 *
 * Rows are plain text, not links — same "don't link to a route that
 * doesn't exist yet" precedent MaintenanceCaseList's own doc comment
 * already gives for E07-S021 "Case detail" (`/maintenance/[id]`), still
 * unbuilt as of this story too.
 *
 * No trackEvent calls — same "pure read, logger only" precedent
 * MaintenanceCaseList itself already follows; trackEvent in this
 * codebase is reserved for user-initiated mutations (S013/S018/S019),
 * not list loads.
 */
export default function MaintenanceHistoryList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading maintenance history", { correlationId });

    listMaintenanceCases().then(async (casesResult) => {
      if (cancelled) return;

      if (!casesResult.ok) {
        logger.error("failed to load maintenance case list", { correlationId, code: casesResult.error.code });
        setState({ status: "error" });
        return;
      }

      const cases = casesResult.value;
      const sessionResults = await Promise.all(cases.map((item) => getDiagnosticSessionForCase(item.id)));
      if (cancelled) return;

      const items: HistoryItem[] = [];
      for (let i = 0; i < cases.length; i++) {
        const maintenanceCase = cases[i];
        const sessionResult = sessionResults[i];
        if (!maintenanceCase || !sessionResult) continue;

        if (!sessionResult.ok) {
          logger.error("failed to load a diagnostic session for maintenance history", {
            correlationId,
            id: maintenanceCase.id,
            code: sessionResult.error.code,
          });
          setState({ status: "error" });
          return;
        }

        items.push({
          maintenanceCase,
          status: sessionResult.value?.status ?? null,
          completionSummary: sessionResult.value?.lastCompletionSummary,
          escalationReason: sessionResult.value?.lastEscalationReason,
        });
      }

      logger.info("maintenance history loaded", { correlationId, count: items.length });
      setState({ status: "loaded", items });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入維修歷史。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無維修歷史。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
        <li key={item.maintenanceCase.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <strong>{item.maintenanceCase.title}</strong>
          <br />
          {item.status && (
            <>
              <span>狀態:{SESSION_STATUS_LABELS[item.status]}</span>
              <br />
            </>
          )}
          {item.completionSummary && (
            <>
              <span>摘要:{item.completionSummary}</span>
              <br />
            </>
          )}
          {item.escalationReason && (
            <>
              <span>原因:{item.escalationReason}</span>
              <br />
            </>
          )}
          <time dateTime={item.maintenanceCase.updatedAt}>{new Date(item.maintenanceCase.updatedAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
