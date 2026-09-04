"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getMaintenanceCase, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSession, type DiagnosticSessionStatus } from "@/lib/diagnostic-sessions";
import { ERROR_CODE_OPTIONS } from "@/lib/error-codes";
import { EQUIPMENT_OPTIONS } from "@/lib/equipment";

const logger = createLogger("web:case-detail");

/** Same 5-value label set maintenance-session.tsx/maintenance-history-list.tsx each already duplicate locally — same "small enough that a shared import isn't worth the coupling" precedent formatFileSize's own copies establish. */
const SESSION_STATUS_LABELS: Record<DiagnosticSessionStatus, string> = {
  OPEN: "待處理",
  IN_PROGRESS: "進行中",
  RESOLVED: "已解決",
  ESCALATED: "已升級",
  CANCELLED: "已取消",
};

/** Same shape as current-step-card.tsx's own module-private formatFileSize — 4th independent copy in this codebase, same deliberate small-duplication precedent. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; maintenanceCase: MaintenanceCaseSummary; session: DiagnosticSession | null };

/**
 * E07-S021 "Case detail" — the `/maintenance/[id]` route every earlier
 * story that mentioned it (MaintenanceCaseList's own S001 doc comment,
 * MaintenanceHistoryList's own S020 doc comment) explicitly deferred to,
 * same relationship KnowledgeDetail (E05-S005) already has with
 * KnowledgeList's own deferred link. Read-only, same restraint
 * KnowledgeDetail's own doc comment states for itself — the interactive
 * flow stays on its own separate route, /maintenance/[id]/session
 * (E07-S006), which already existed before this story added a page to
 * link to it from.
 *
 * Composes the same two already-approved reads maintenance-session.tsx
 * itself already combines — getMaintenanceCase (S001) then
 * getDiagnosticSessionForCase (S006) — and, like that file (not like
 * KnowledgeDetail's own "degrade independently" secondary-enrichment
 * pattern), fails the WHOLE page closed if either fails: unlike
 * KnowledgeDetail's document count (a genuinely secondary aggregate on
 * top of an already-useful primary load), a case's diagnostic status
 * *is* this page's primary content, not an optional extra — the more
 * directly on-point precedent here is maintenance-session.tsx's own
 * existing handling of this exact fetch pair, not a different domain's
 * different-shaped page.
 *
 * Displays, each only when present (same "absence means nothing to
 * show" precedent this whole codebase already follows): 設備 (via
 * EQUIPMENT_OPTIONS lookup, same pattern MaintenanceCaseList's own
 * doc comment establishes for boundModel-style references), 序號,
 * 錯誤代碼 (+ description, same ERROR_CODE_OPTIONS lookup
 * MaintenanceCaseList already uses), 狀態 (once a session exists),
 * 補充說明/略過原因/附加照片/摘要/原因 (the five recorded free-text
 * fields DiagnosticSession accumulates across S009/S012/S013/S019/S018
 * — reusing the exact SAME short labels current-step-card.tsx's own
 * "您的補充說明:"/"已略過此步驟,原因:"/"已附加照片:" already establish
 * for the first three, and this session's own newly-set "摘要:"/"原因:"
 * short-form convention (E07-S020) for the last two — deliberately
 * NOT the raw `currentStepIndex`/`lastSelectedOptionId`: this file's
 * own flat, non-branching, last-answer-only session model
 * (diagnostic-steps.ts's own doc comment) can't honestly reconstruct
 * "which option was picked at which step" once currentStepIndex has
 * moved on, so showing either would risk displaying misleading
 * pseudo-history rather than an honest summary).
 *
 * Always shows one 查看診斷內容 link to the interactive session page,
 * regardless of status — that page already handles every status
 * gracefully on its own (S018/S019 built exactly that), so this page
 * doesn't duplicate that branching logic with its own conditional link
 * wording.
 *
 * Deliberately does NOT retrofit MaintenanceCaseList (S001) or
 * MaintenanceHistoryList (S020) into linking here, even though both
 * components' own doc comments name this exact route as what they were
 * waiting for (same relationship KnowledgeList had with KnowledgeDetail,
 * which DID retrofit). Both components' existing, already-approved
 * "renders no links" tests assert exactly zero links; turning items
 * into links would flip those assertions' truth value outright, which
 * doesn't fit STORY_WORKFLOW's own narrow test-freeze exception (add
 * interaction steps, keep assertions byte-for-byte unchanged) the way
 * E07-S017's own precedent did. Self-adopted as a deliberate, reversible
 * scope boundary rather than stretched — see archive/stories/E07-S021.md's
 * own Assumptions section for the full reasoning. Reachable by direct
 * URL/deep link in the meantime (exercised at the E2E layer the same
 * way maintenance-session.spec.ts's own deep-link tests already do).
 */
export default function CaseDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading case detail", { correlationId, id });

    getMaintenanceCase(id).then(async (caseResult) => {
      if (cancelled) return;

      if (!caseResult.ok) {
        logger.error("failed to load maintenance case", { correlationId, id, code: caseResult.error.code });
        setState({ status: "error" });
        return;
      }

      if (!caseResult.value) {
        logger.info("maintenance case not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      const maintenanceCase = caseResult.value;
      const sessionResult = await getDiagnosticSessionForCase(id);
      if (cancelled) return;

      if (!sessionResult.ok) {
        logger.error("failed to load diagnostic session", { correlationId, id, code: sessionResult.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("case detail loaded", { correlationId, id, sessionStatus: sessionResult.value?.status ?? null });
      setState({ status: "loaded", maintenanceCase, session: sessionResult.value });
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
        <ErrorMessage message="無法載入維修案例。" />
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

  const { maintenanceCase, session } = state;
  const equipmentName = maintenanceCase.equipmentId
    ? EQUIPMENT_OPTIONS.find((option) => option.id === maintenanceCase.equipmentId)?.name
    : undefined;
  const errorCodeDescription = maintenanceCase.errorCode
    ? ERROR_CODE_OPTIONS.find((option) => option.code === maintenanceCase.errorCode)?.description
    : undefined;

  return (
    <main style={{ padding: 32 }}>
      <h1>{maintenanceCase.title}</h1>
      {equipmentName && <p>設備:{equipmentName}</p>}
      {maintenanceCase.serialNumber && <p>序號:{maintenanceCase.serialNumber}</p>}
      {maintenanceCase.errorCode && (
        <p>
          錯誤代碼:{maintenanceCase.errorCode}
          {errorCodeDescription ? ` — ${errorCodeDescription}` : ""}
        </p>
      )}
      <p>
        <time dateTime={maintenanceCase.updatedAt}>{new Date(maintenanceCase.updatedAt).toLocaleString("zh-TW")}</time>
      </p>
      {session && (
        <>
          <p>狀態:{SESSION_STATUS_LABELS[session.status]}</p>
          {session.lastFreeTextDetail && <p>補充說明:{session.lastFreeTextDetail}</p>}
          {session.lastSkipReason && <p>略過原因:{session.lastSkipReason}</p>}
          {session.lastPhotoFileName && (
            <p>
              附加照片:{session.lastPhotoFileName}
              {typeof session.lastPhotoSizeBytes === "number" && <>({formatFileSize(session.lastPhotoSizeBytes)})</>}
            </p>
          )}
          {session.lastCompletionSummary && <p>摘要:{session.lastCompletionSummary}</p>}
          {session.lastEscalationReason && <p>原因:{session.lastEscalationReason}</p>}
        </>
      )}
      <p>
        <Link href={`/maintenance/${id}/session`}>查看診斷內容</Link>
      </p>
    </main>
  );
}
