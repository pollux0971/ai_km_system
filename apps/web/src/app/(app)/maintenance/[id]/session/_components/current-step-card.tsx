"use client";

import { useEffect, useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { goToPreviousStep, selectDecisionOption, type DiagnosticSession } from "@/lib/diagnostic-sessions";
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
 */
export default function CurrentStepCard({
  sessionId,
  step,
  onAdvanced,
  recordedDetail,
}: {
  sessionId?: string;
  step: DiagnosticStep;
  onAdvanced?: (session: DiagnosticSession) => void;
  recordedDetail?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailText, setDetailText] = useState("");
  const detailFieldId = useId();

  useEffect(() => {
    setDetailText("");
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

  return (
    <section>
      <h2>步驟 {step.stepIndex + 1}</h2>
      <p>{step.instruction}</p>
      {recordedDetail && (
        <p>
          您的補充說明:<span>{recordedDetail}</span>
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
        </>
      )}
      {step.stepIndex > 0 && (
        <p>
          <button type="button" onClick={handleGoBack} disabled={pending}>
            上一步
          </button>
        </p>
      )}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}
