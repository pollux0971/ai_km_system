"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listMaintenanceCases } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSessionStatus } from "@/lib/diagnostic-sessions";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:maintenance-report");

/** Same 5-value label set maintenance-session.tsx/maintenance-history-list.tsx/case-detail.tsx each already duplicate locally — same "small enough that a shared import isn't worth the coupling" precedent formatFileSize's own copies establish. Plus NOT_STARTED, this file's own 6th bucket for a case with no session yet (see doc comment below). */
const STATUS_LABELS: Record<DiagnosticSessionStatus | "NOT_STARTED", string> = {
  NOT_STARTED: "尚未開始",
  OPEN: "待處理",
  IN_PROGRESS: "進行中",
  RESOLVED: "已解決",
  ESCALATED: "已升級",
  CANCELLED: "已取消",
};

const STATUS_ORDER: (DiagnosticSessionStatus | "NOT_STARTED")[] = ["NOT_STARTED", "OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "CANCELLED"];

interface ReportRow {
  title: string;
  equipmentName?: string;
  serialNumber?: string;
  errorCode?: string;
  statusLabel: string;
  updatedAt: string;
}

const CSV_HEADER = ["案例標題", "設備", "序號", "錯誤代碼", "狀態", "更新時間"];

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Pure, exported for its own direct unit tests (RFC4180-shaped: CRLF
 * row separators, double-quote escaping for any field containing a
 * comma/quote/newline) — same "extract the fiddly formatting logic into
 * its own directly-testable function" reasoning formatFileSize already
 * follows, just promoted to a named export here since CSV escaping has
 * genuinely more edge cases worth their own dedicated tests than a
 * three-branch byte-size formatter does.
 */
export function casesToCsv(rows: ReportRow[]): string {
  const lines = [CSV_HEADER.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(
      [row.title, row.equipmentName ?? "", row.serialNumber ?? "", row.errorCode ?? "", row.statusLabel, row.updatedAt]
        .map(escapeCsvField)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; rows: ReportRow[]; counts: Record<DiagnosticSessionStatus | "NOT_STARTED", number> };

/**
 * E07-S022 "Maintenance report view/export". The first export/download
 * feature anywhere in this codebase — no existing precedent to follow,
 * so the choices below are deliberate, not copied.
 *
 * "View" = a status-breakdown aggregate across every case (distinct from
 * MaintenanceHistoryList's own per-case row-by-row list, E07-S020, and
 * CaseDetail's own single-case summary, E07-S021) — how many cases are
 * in each of DiagnosticSessionStatus's 5 pinned states, plus a 6th
 * NOT_STARTED bucket this file adds for a case with no session yet
 * (createDiagnosticSession only ever runs once a user actually opens
 * /maintenance/[id]/session — see that page's own doc comment — so a
 * freshly created case can genuinely have none). Reuses the exact same
 * two already-approved reads MaintenanceHistoryList itself already
 * combines — listMaintenanceCases (S001) + getDiagnosticSessionForCase
 * (S006) — and, for the same reasoning that file's own doc comment
 * gives, fails the WHOLE page closed if either fails rather than
 * degrading a single row silently: status counts *are* this page's
 * entire primary content, not a secondary enrichment.
 *
 * "Export" = a plain `<a download href="data:text/csv;...">`, not a
 * Blob+URL.createObjectURL dance. A data: URI needs no browser API this
 * test environment (jsdom) doesn't already support, is directly
 * assertable in a unit test (read the href, decode it), and is still a
 * genuinely real, functional download in an actual browser (verified at
 * the E2E layer via Playwright's own download event) — not a mock
 * standing in for a capability that doesn't really work. A UTF-8 BOM
 * prefix (`﻿`) keeps Excel from mis-detecting the Chinese-character
 * CSV's encoding; deliberately not chased any further than that (no
 * chunked/streamed download, no server-generated file) — this repo's
 * mock case store is bounded to whatever a single MVP session's worth
 * of seed + user-created cases holds, so embedding the whole CSV inline
 * in one data: URI is the honestly-simplest correct technique for the
 * data volume this thin slice actually has, not a shortcut around a
 * real constraint.
 *
 * One `maintenance_report_export` telemetry event fires on click — the
 * closest thing to a "sensitive operation" this otherwise pure-read page
 * has (a real artifact leaves the browser), unlike MaintenanceCaseList/
 * MaintenanceHistoryList/CaseDetail's own "pure read, logger only, no
 * trackEvent" precedent for a plain view. The `<a>`'s own native
 * `download` behavior fires independently of this handler — the handler
 * only adds telemetry, it never blocks or redirects the download itself
 * (same "telemetry must never block or fail the caller's own flow"
 * discipline trackEvent's own doc comment already states).
 */
export default function MaintenanceReport() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading maintenance report", { correlationId });

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

      const counts: Record<DiagnosticSessionStatus | "NOT_STARTED", number> = {
        NOT_STARTED: 0,
        OPEN: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        ESCALATED: 0,
        CANCELLED: 0,
      };
      const rows: ReportRow[] = [];

      for (let i = 0; i < cases.length; i++) {
        const maintenanceCase = cases[i];
        const sessionResult = sessionResults[i];
        if (!maintenanceCase || !sessionResult) continue;

        if (!sessionResult.ok) {
          logger.error("failed to load a diagnostic session for maintenance report", {
            correlationId,
            id: maintenanceCase.id,
            code: sessionResult.error.code,
          });
          setState({ status: "error" });
          return;
        }

        const bucket = sessionResult.value?.status ?? "NOT_STARTED";
        counts[bucket]++;
        rows.push({
          title: maintenanceCase.title,
          serialNumber: maintenanceCase.serialNumber,
          errorCode: maintenanceCase.errorCode,
          statusLabel: STATUS_LABELS[bucket],
          updatedAt: maintenanceCase.updatedAt,
        });
      }

      logger.info("maintenance report loaded", { correlationId, count: rows.length });
      setState({ status: "loaded", rows, counts });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入維修報表。" />;
  }

  const { rows, counts } = state;
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${casesToCsv(rows)}`)}`;

  function handleExportClick() {
    const correlationId = crypto.randomUUID();
    trackEvent("maintenance_report_export", { correlationId, properties: { caseCount: rows.length } });
  }

  return (
    <div>
      <p>案例總數:{rows.length}</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {STATUS_ORDER.map((status) => (
          <li key={status}>
            {STATUS_LABELS[status]}:{counts[status]}
          </li>
        ))}
      </ul>
      <p>
        <a href={csvHref} download="maintenance-report.csv" onClick={handleExportClick}>
          匯出 CSV
        </a>
      </p>
    </div>
  );
}
