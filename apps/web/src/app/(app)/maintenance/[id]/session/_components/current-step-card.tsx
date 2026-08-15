"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { selectDecisionOption, type DiagnosticSession } from "@/lib/diagnostic-sessions";
import type { DiagnosticStep } from "@/lib/diagnostic-steps";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:current-step-card");

/**
 * E07-S007 "Current-step card" / E07-S008 "Decision options".
 * `sessionId`/`onAdvanced` are optional — S007's own existing tests
 * render a step with no `options` and never need either (see
 * diagnostic-steps.ts's own doc comment: only step 0 has options today),
 * same "the interactive path only turns on when there's something to be
 * interactive about" shape KnowledgeDocumentRetryButton's own conditional
 * rendering follows for a document that isn't currently failed.
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
 */
export default function CurrentStepCard({
  sessionId,
  step,
  onAdvanced,
}: {
  sessionId?: string;
  step: DiagnosticStep;
  onAdvanced?: (session: DiagnosticSession) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(optionId: string) {
    if (pending || !sessionId) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("selecting diagnostic decision option", { correlationId, sessionId, optionId });
    trackEvent("maintenance_session_option_select_attempt", { correlationId, properties: { sessionId, optionId } });

    const result = await selectDecisionOption(sessionId, optionId);

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

  return (
    <section>
      <h2>步驟 {step.stepIndex + 1}</h2>
      <p>{step.instruction}</p>
      {step.options && step.options.length > 0 && (
        <p>
          {step.options.map((option) => (
            <button key={option.id} type="button" onClick={() => handleSelect(option.id)} disabled={pending} style={{ marginRight: 8 }}>
              {option.label}
            </button>
          ))}
        </p>
      )}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}
