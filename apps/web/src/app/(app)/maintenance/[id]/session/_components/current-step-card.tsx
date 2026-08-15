"use client";

import { useEffect, useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import {
  goToPreviousStep,
  restartDiagnosticSession,
  selectDecisionOption,
  skipDiagnosticStep,
  type DiagnosticSession,
} from "@/lib/diagnostic-sessions";
import type { DiagnosticStep } from "@/lib/diagnostic-steps";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:current-step-card");

/**
 * E07-S007 "Current-step card" / E07-S008 "Decision options" / E07-S009
 * "Free-text detail". `sessionId`/`onAdvanced` are optional — S007's own
 * existing tests render a step with no `options` and never need either
 * (see diagnostic-steps.ts's own doc comment: only step 0 has options
 * today), same "the interactive path only turns on when there's something
 * to be interactive about" shape KnowledgeDocumentRetryButton's own
 * conditional rendering follows for a document that isn't currently
 * failed.
 *
 * Owns its own selection mutation (calls selectDecisionOption directly)
 * rather than delegating the click up to maintenance-session.tsx —
 * same "the item-level component owns its own mutation, the parent just
 * gets a refresh/update callback" shape KnowledgeDocumentRetryButton/
 * KnowledgeDocumentArchiveToggle already establish. `onAdvanced` hands
 * the parent the already-updated DiagnosticSession (not just a "refetch"
 * signal) since there is no separate refetch — the mutation's own
 * response IS the new truth, same shape createDiagnosticSession's own
 * caller (maintenance-session.tsx) already follows for its result.
 *
 * The free-text textarea (E07-S009) only renders alongside real options —
 * same "required choice + optional free text, one submission" shape
 * maintenance-cases.ts's own createMaintenanceCase already establishes for
 * equipmentId + problemDescription (see selectDecisionOption's own doc
 * comment), not a second independent action. The trimmed value is passed
 * as `handleSelect`'s third argument ONLY when non-empty — omitted
 * entirely (not passed as `""`/`undefined`) when blank, so a click with no
 * typed detail calls selectDecisionOption with the exact same 2-argument
 * shape E07-S008's own existing test already locks in, needing no change
 * there. `recordedDetail` (session.lastFreeTextDetail, passed down by
 * maintenance-session.tsx) is shown back once set — an input with no
 * visible effect anywhere would be a write-only void, not a real
 * capability (Functional AC 8).
 *
 * Telemetry/log calls carry `hasDetail` (a boolean) never the detail TEXT
 * itself — same "don't log enterprise/user-authored content" restraint
 * knowledge-document-retry-button.tsx's own doc comment already follows
 * for document names.
 *
 * The 上一步 button (E07-S010 "Previous-step action") only renders when
 * `step.stepIndex > 0` — there is no step before the first one, same
 * "the interactive path only turns on when there's something to be
 * interactive about" reasoning this file's own top doc comment already
 * gives for `sessionId`/`onAdvanced`. Shares `pending`/`error` state with
 * option selection (see handleSelect) rather than its own — the two
 * actions are mutually exclusive on the same step at the same time, and
 * reusing the same state avoids a second, independent pending/error pair
 * for what is structurally the same "one mutation in flight" concern.
 *
 * `detailText` resets whenever `step.stepIndex` changes (forward via a
 * successful selection, or backward via 上一步) — this same component
 * instance stays mounted across a step transition (maintenance-session.tsx
 * re-renders it with new props, it doesn't unmount/remount), so without
 * this the textarea would keep showing a stale, already-submitted-or-
 * abandoned draft after the session has moved to a different step.
 *
 * The 重新開始 button (E07-S011 "Restart diagnostic") is deliberately NOT
 * gated on `step.stepIndex` the way 上一步 is — it's a session-level
 * action, not a step-level one (see restartDiagnosticSession's own doc
 * comment), so it renders whenever `sessionId` is present, including on
 * the very first step. No confirmation dialog: this resets Team A mock
 * local state, not an irreversible business action.
 *
 * The 略過原因 textarea + 跳過此步驟 button (E07-S012 "Skip-step UX with
 * reason") only render alongside real options, same visibility condition
 * as 補充說明 — nothing to skip on a step with no decision to make. Unlike
 * 補充說明 (optional, so the option buttons stay enabled either way), the
 * skip button itself stays `disabled` until `skipReason.trim()` is
 * non-empty — a client-side reflection of the server's own mandatory-
 * reason validation (see skipDiagnosticStep's own doc comment), not a
 * replacement for it.
 */
export default function CurrentStepCard({
  sessionId,
  step,
  onAdvanced,
  recordedDetail,
  recordedSkipReason,
}: {
  sessionId?: string;
  step: DiagnosticStep;
  onAdvanced?: (session: DiagnosticSession) => void;
  recordedDetail?: string;
  recordedSkipReason?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailText, setDetailText] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const detailFieldId = useId();
  const skipFieldId = useId();

  useEffect(() => {
    setDetailText("");
    setSkipReason("");
  }, [step.stepIndex]);

  async function handleSelect(optionId: string) {
    if (pending || !sessionId) return;

    const trimmedDetail = detailText.trim();
    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("selecting diagnostic decision option", { correlationId, sessionId, optionId, hasDetail: Boolean(trimmedDetail) });
    trackEvent("maintenance_session_option_select_attempt", {
      correlationId,
      properties: { sessionId, optionId, hasDetail: Boolean(trimmedDetail) },
    });

    const result = trimmedDetail
      ? await selectDecisionOption(sessionId, optionId, trimmedDetail)
      : await selectDecisionOption(sessionId, optionId);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to select diagnostic decision option", { correlationId, sessionId, optionId, code: result.error.code });
      trackEvent("maintenance_session_option_select_failure", {
        correlationId,
        properties: { sessionId, optionId, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    logger.info("diagnostic decision option selected", { correlationId, sessionId, optionId });
    trackEvent("maintenance_session_option_select_success", { correlationId, properties: { sessionId, optionId } });
    onAdvanced?.(result.value);
  }

  async function handleGoBack() {
    if (pending || !sessionId) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("going to previous diagnostic step", { correlationId, sessionId });
    trackEvent("maintenance_session_go_back_attempt", { correlationId, properties: { sessionId } });

    const result = await goToPreviousStep(sessionId);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to go to previous diagnostic step", { correlationId, sessionId, code: result.error.code });
      trackEvent("maintenance_session_go_back_failure", { correlationId, properties: { sessionId, code: result.error.code } });
      setError(result.error.message);
      return;
    }

    logger.info("returned to previous diagnostic step", { correlationId, sessionId });
    trackEvent("maintenance_session_go_back_success", { correlationId, properties: { sessionId } });
    onAdvanced?.(result.value);
  }

  async function handleRestart() {
    if (pending || !sessionId) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("restarting diagnostic session", { correlationId, sessionId });
    trackEvent("maintenance_session_restart_attempt", { correlationId, properties: { sessionId } });

    const result = await restartDiagnosticSession(sessionId);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to restart diagnostic session", { correlationId, sessionId, code: result.error.code });
      trackEvent("maintenance_session_restart_failure", { correlationId, properties: { sessionId, code: result.error.code } });
      setError(result.error.message);
      return;
    }

    logger.info("diagnostic session restarted", { correlationId, sessionId });
    trackEvent("maintenance_session_restart_success", { correlationId, properties: { sessionId } });
    onAdvanced?.(result.value);
  }

  async function handleSkip() {
    const trimmedReason = skipReason.trim();
    if (pending || !sessionId || !trimmedReason) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("skipping diagnostic step", { correlationId, sessionId });
    trackEvent("maintenance_session_skip_attempt", { correlationId, properties: { sessionId } });

    const result = await skipDiagnosticStep(sessionId, trimmedReason);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to skip diagnostic step", { correlationId, sessionId, code: result.error.code });
      trackEvent("maintenance_session_skip_failure", { correlationId, properties: { sessionId, code: result.error.code } });
      setError(result.error.message);
      return;
    }

    logger.info("diagnostic step skipped", { correlationId, sessionId });
    trackEvent("maintenance_session_skip_success", { correlationId, properties: { sessionId } });
    onAdvanced?.(result.value);
  }

  return (
    <section>
      <h2>步驟 {step.stepIndex + 1}</h2>
      <p>{step.instruction}</p>
      {recordedDetail && (
        <p>
          您的補充說明:<span>{recordedDetail}</span>
        </p>
      )}
      {recordedSkipReason && (
        <p>
          已略過此步驟,原因:<span>{recordedSkipReason}</span>
        </p>
      )}
      {step.options && step.options.length > 0 && (
        <>
          <p>
            <label htmlFor={detailFieldId}>補充說明</label>
            <br />
            <textarea
              id={detailFieldId}
              value={detailText}
              onChange={(event) => setDetailText(event.target.value)}
              disabled={pending}
            />
          </p>
          <p>
            {step.options.map((option) => (
              <button key={option.id} type="button" onClick={() => handleSelect(option.id)} disabled={pending} style={{ marginRight: 8 }}>
                {option.label}
              </button>
            ))}
          </p>
          <p>
            <label htmlFor={skipFieldId}>略過原因</label>
            <br />
            <textarea
              id={skipFieldId}
              value={skipReason}
              onChange={(event) => setSkipReason(event.target.value)}
              disabled={pending}
            />
          </p>
          <p>
            <button type="button" onClick={handleSkip} disabled={pending || !skipReason.trim()}>
              跳過此步驟
            </button>
          </p>
        </>
      )}
      {step.stepIndex > 0 && (
        <p>
          <button type="button" onClick={handleGoBack} disabled={pending}>
            上一步
          </button>
        </p>
      )}
      {sessionId && (
        <p>
          <button type="button" onClick={handleRestart} disabled={pending}>
            重新開始
          </button>
        </p>
      )}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}
