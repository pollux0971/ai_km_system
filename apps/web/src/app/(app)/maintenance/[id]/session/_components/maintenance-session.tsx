"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getMaintenanceCase, type MaintenanceCaseSummary } from "@/lib/maintenance-cases";
import {
  createDiagnosticSession,
  getDiagnosticSessionForCase,
  type DiagnosticSession,
  type DiagnosticSessionStatus,
} from "@/lib/diagnostic-sessions";

const logger = createLogger("web:maintenance-session");

/** Chinese labels for the 5 pinned SOURCE_BASELINE session states — same role role-labels.ts's own ROLE_LABELS plays for Role. */
const SESSION_STATUS_LABELS: Record<DiagnosticSessionStatus, string> = {
  OPEN: "待處理",
  IN_PROGRESS: "進行中",
  RESOLVED: "已解決",
  ESCALATED: "已升級",
  CANCELLED: "已取消",
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; maintenanceCase: MaintenanceCaseSummary; session: DiagnosticSession };

/**
 * E07-S006 "Diagnostic session shell" — the wrapping frame a diagnostic
 * session lives inside, not its step-by-step interior (E07-S007
 * "Current-step card" onward own that, mirroring how E08-S10 "Node
 * Transition" and neighbors are Team B's own later stories on top of
 * E08-S08 "Session Create"/E08-S09 "Session State"). Loading/error/
 * not-found/loaded states mirror KnowledgeDetail/ConversationDetail's
 * own established pattern.
 *
 * On mount: loads the case (for display), then looks for an existing
 * session for it via getDiagnosticSessionForCase — if one already
 * exists, this resumes it as-is (no second session is ever created for
 * the same case); if none exists yet, createDiagnosticSession starts a
 * fresh one at status OPEN. This two-step "check, then create only if
 * missing" sequence — rather than a single upsert-style call — keeps
 * "resume" and "start" as two honestly distinct, separately-observable
 * outcomes, same reasoning knowledge-document-list.tsx's own two-
 * sequential-fetches (not a combined call) already follows for a
 * similar "confirm the parent, then act" shape.
 *
 * A NOT_FOUND maintenance case fails closed with the shared NOT_FOUND
 * ErrorMessage code, same as every other `[id]` route in this
 * codebase — no session is attempted for a case that doesn't exist,
 * since createDiagnosticSession's own NOT_FOUND guard would reject it
 * anyway; checking here first avoids a pointless dependent call.
 *
 * E07-S002's own NewMaintenanceCasePage now redirects HERE (not to
 * /maintenance) once a case is created — see that page's own updated
 * doc comment — since this route (keyed by case id, not by the
 * not-yet-built /maintenance/[id] detail page E07-S021 still owns) is
 * a genuine next destination a freshly-created case can lead into,
 * unlike when S002 originally redirected to the plain list because
 * nothing more specific existed yet.
 */
export default function MaintenanceSession({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading maintenance case for diagnostic session", { correlationId, id });

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
      const existingSessionResult = await getDiagnosticSessionForCase(id);
      if (cancelled) return;

      if (!existingSessionResult.ok) {
        logger.error("failed to load diagnostic session", { correlationId, id, code: existingSessionResult.error.code });
        setState({ status: "error" });
        return;
      }

      if (existingSessionResult.value) {
        logger.info("resuming existing diagnostic session", {
          correlationId,
          id,
          sessionId: existingSessionResult.value.id,
        });
        setState({ status: "loaded", maintenanceCase, session: existingSessionResult.value });
        return;
      }

      const createdSessionResult = await createDiagnosticSession(id);
      if (cancelled) return;

      if (!createdSessionResult.ok) {
        logger.error("failed to create diagnostic session", { correlationId, id, code: createdSessionResult.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("diagnostic session created", { correlationId, id, sessionId: createdSessionResult.value.id });
      setState({ status: "loaded", maintenanceCase, session: createdSessionResult.value });
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
        <ErrorMessage message="無法載入維修診斷。" />
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

  return (
    <main style={{ padding: 32 }}>
      <h1>{maintenanceCase.title}</h1>
      <p>
        診斷狀態:<span>{SESSION_STATUS_LABELS[session.status]}</span>
      </p>
      <p>尚未有診斷步驟。</p>
      <p>
        <Link href="/maintenance">返回維修助手首頁</Link>
      </p>
    </main>
  );
}
