"use client";

import { useEffect, useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import {
  goToPreviousStep,
  restartDiagnosticSession,
  selectDecisionOption,
  skipDiagnosticStep,
  type DiagnosticSession,
} from "@/lib/diagnostic-sessions";
import { explainDiagnosticStep } from "@/lib/diagnostic-explanations";
import { getDiagnosticStepCitation, type SopCitation } from "@/lib/diagnostic-citations";
import type { DiagnosticStep } from "@/lib/diagnostic-steps";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:current-step-card");

/**
 * Module-private, same "duplicate this small formatter per domain rather
 * than share cross-vertical" precedent knowledge/[id]/documents/
 * format-file-size.ts's own doc comment already establishes against
 * conversations/[id]/_components/file-attachment-picker.tsx's own
 * module-private copy — a third independent copy for E07, not a new
 * cross-vertical import.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
 *
 * The 附加照片 file input (E07-S013 "Photo upload") only renders alongside
 * real options, same visibility condition as 補充說明/略過原因 — bundled
 * into the same one-submission shape as 補充說明 (see selectDecisionOption's
 * own doc comment for why this story chose bundled over a standalone
 * upload action), not the skip path. `accept="image/*"` is a picker HINT,
 * not an enforced restriction — same "no invented type/size restriction"
 * restraint FileAttachmentPicker's own doc comment already establishes,
 * fully overridable by the user's own OS file dialog. The selected `File`
 * lives only in this component's own `photoFile` state until submission
 * (never persisted here) — an explicit "已選擇" preview (name + formatted
 * size + a 移除相片 button to correct a wrong pick) is rendered manually
 * rather than relying on native file-input chrome, same
 * FileAttachmentPicker precedent, since native chrome varies by browser,
 * shows no size, and isn't reliably queryable by Playwright/RTL either way.
 * `recordedPhotoFileName`/`recordedPhotoSizeBytes` (session.lastPhotoFileName/
 * lastPhotoSizeBytes, passed down by maintenance-session.tsx) are shown
 * back once set, same "an input with no visible effect anywhere would be a
 * write-only void" reasoning `recordedDetail` above already gives.
 *
 * The AI 說明 toggle button (E07-S014 "AI explain-step panel") is gated on
 * `sessionId` alone — same "the interactive path only turns on when
 * there's something to be interactive about" reasoning this file's own top
 * doc comment already gives, and specifically NOT gated on `step.options`
 * the way 補充說明/附加照片/略過原因 are: explaining a step is meaningful on
 * every step, not just ones with a decision to make (unlike those three,
 * which have nothing to attach to on a step with no options). Gating on
 * `sessionId` is required, not just thematically consistent — S007's own
 * existing "renders no option buttons when the step has no options" test
 * asserts zero buttons total on a `sessionId`-less render, so an
 * unconditionally-rendered explain button would break that frozen
 * assertion.
 *
 * Deliberately uses its OWN `explainPending`/`explainError` state rather
 * than sharing `pending`/`error` with select/back/restart/skip — unlike
 * those four (genuinely mutually exclusive mutations on the same session,
 * see this file's own reasoning above for why THEY share one pair),
 * reading an explanation is not a mutation at all; sharing state would
 * wrongly disable the option/skip/restart buttons (all gated on the shared
 * `pending`) while a user is simply reading, a real UX regression this
 * story does not introduce.
 *
 * `explanation` short-circuits `handleToggleExplain` once already loaded —
 * re-opening a step's panel after collapsing it shows the cached text
 * instead of calling `explainDiagnosticStep` again, since the content is
 * static per-`stepIndex` and re-fetching would be pure waste, not a
 * refresh of anything that could have changed. Reset (`explainOpen`/
 * `explainError`/`explanation` all cleared) on `step.stepIndex` change,
 * same trigger and reasoning as `detailText`/`skipReason`/`photoFile`'s
 * own reset above.
 *
 * The SOP 引用來源 toggle button (E07-S015 "SOP citation component") is a
 * structural twin of the AI 說明 button immediately above it — same
 * `sessionId`-only gating (required for the same S007 zero-buttons-test
 * reason), same fully independent `sopPending`/`sopError`/`sopCitation`
 * state (not shared with `pending`/`error` NOR with `explainPending`/
 * `explainError` — the two panels are not mutually exclusive with each
 * other either; a user can plausibly want both open at once, see
 * diagnostic-citations.ts's own doc comment for why this mirrors S014's
 * mechanics rather than message-content.tsx's `[N]`-marker mechanics), same
 * short-circuit-once-loaded caching, same reset-on-`step.stepIndex`-change.
 * Deliberately a SEPARATE toggle from AI 說明 rather than one combined
 * panel — explaining WHY a step matters and citing WHERE its SOP comes
 * from are genuinely different questions with genuinely different answers,
 * same "one story, one distinct capability" granularity every other pair
 * of adjacent E07 stories in this file already follows.
 */
export default function CurrentStepCard({
  sessionId,
  step,
  onAdvanced,
  recordedDetail,
  recordedSkipReason,
  recordedPhotoFileName,
  recordedPhotoSizeBytes,
}: {
  sessionId?: string;
  step: DiagnosticStep;
  onAdvanced?: (session: DiagnosticSession) => void;
  recordedDetail?: string;
  recordedSkipReason?: string;
  recordedPhotoFileName?: string;
  recordedPhotoSizeBytes?: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailText, setDetailText] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPending, setExplainPending] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [sopOpen, setSopOpen] = useState(false);
  const [sopPending, setSopPending] = useState(false);
  const [sopError, setSopError] = useState<string | null>(null);
  const [sopCitation, setSopCitation] = useState<SopCitation | null>(null);
  const detailFieldId = useId();
  const skipFieldId = useId();
  const photoFieldId = useId();

  useEffect(() => {
    setDetailText("");
    setSkipReason("");
    setPhotoFile(null);
    setExplainOpen(false);
    setExplainError(null);
    setExplanation(null);
    setSopOpen(false);
    setSopError(null);
    setSopCitation(null);
  }, [step.stepIndex]);

  async function handleSelect(optionId: string) {
    if (pending || !sessionId) return;

    const trimmedDetail = detailText.trim();
    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("selecting diagnostic decision option", {
      correlationId,
      sessionId,
      optionId,
      hasDetail: Boolean(trimmedDetail),
      hasPhoto: Boolean(photoFile),
    });
    trackEvent("maintenance_session_option_select_attempt", {
      correlationId,
      properties: { sessionId, optionId, hasDetail: Boolean(trimmedDetail), hasPhoto: Boolean(photoFile) },
    });

    const result = photoFile
      ? await selectDecisionOption(sessionId, optionId, trimmedDetail || undefined, photoFile)
      : trimmedDetail
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

  async function handleToggleExplain() {
    const opening = !explainOpen;
    setExplainOpen(opening);
    if (!opening || explanation !== null || explainPending) return;

    const correlationId = crypto.randomUUID();
    setExplainPending(true);
    setExplainError(null);
    logger.info("loading AI step explanation", { correlationId, stepIndex: step.stepIndex });
    trackEvent("maintenance_session_explain_step_attempt", { correlationId, properties: { stepIndex: step.stepIndex } });

    const result = await explainDiagnosticStep(step.stepIndex);

    setExplainPending(false);
    if (!result.ok) {
      logger.error("failed to load AI step explanation", { correlationId, stepIndex: step.stepIndex, code: result.error.code });
      trackEvent("maintenance_session_explain_step_failure", { correlationId, properties: { stepIndex: step.stepIndex, code: result.error.code } });
      setExplainError(result.error.message);
      return;
    }

    logger.info("AI step explanation loaded", { correlationId, stepIndex: step.stepIndex });
    trackEvent("maintenance_session_explain_step_success", { correlationId, properties: { stepIndex: step.stepIndex } });
    setExplanation(result.value);
  }

  async function handleToggleSopCitation() {
    const opening = !sopOpen;
    setSopOpen(opening);
    if (!opening || sopCitation !== null || sopPending) return;

    const correlationId = crypto.randomUUID();
    setSopPending(true);
    setSopError(null);
    logger.info("loading SOP citation", { correlationId, stepIndex: step.stepIndex });
    trackEvent("maintenance_session_sop_citation_attempt", { correlationId, properties: { stepIndex: step.stepIndex } });

    const result = await getDiagnosticStepCitation(step.stepIndex);

    setSopPending(false);
    if (!result.ok) {
      logger.error("failed to load SOP citation", { correlationId, stepIndex: step.stepIndex, code: result.error.code });
      trackEvent("maintenance_session_sop_citation_failure", { correlationId, properties: { stepIndex: step.stepIndex, code: result.error.code } });
      setSopError(result.error.message);
      return;
    }

    logger.info("SOP citation loaded", { correlationId, stepIndex: step.stepIndex });
    trackEvent("maintenance_session_sop_citation_success", { correlationId, properties: { stepIndex: step.stepIndex } });
    setSopCitation(result.value);
  }

  return (
    <section>
      <h2>步驟 {step.stepIndex + 1}</h2>
      <p>{step.instruction}</p>
      {sessionId && (
        <p>
          <button type="button" onClick={handleToggleExplain}>
            {explainOpen ? "收合 AI 說明" : "AI 說明"}
          </button>
        </p>
      )}
      {explainOpen && explainPending && <LoadingIndicator />}
      {explainOpen && explainError && <ErrorMessage message={explainError} />}
      {explainOpen && explanation && (
        <p>
          <span>{explanation}</span>
        </p>
      )}
      {sessionId && (
        <p>
          <button type="button" onClick={handleToggleSopCitation}>
            {sopOpen ? "收合 SOP 引用來源" : "SOP 引用來源"}
          </button>
        </p>
      )}
      {sopOpen && sopPending && <LoadingIndicator />}
      {sopOpen && sopError && <ErrorMessage message={sopError} />}
      {sopOpen && sopCitation && (
        <p>
          <span>{sopCitation.title}</span>（<span>{sopCitation.section}</span>）:<span>{sopCitation.snippet}</span>
        </p>
      )}
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
      {recordedPhotoFileName && (
        <p>
          已附加照片:<span>{recordedPhotoFileName}</span>
          {typeof recordedPhotoSizeBytes === "number" && <>({formatFileSize(recordedPhotoSizeBytes)})</>}
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
            <label htmlFor={photoFieldId}>附加照片</label>
            <br />
            <input
              id={photoFieldId}
              type="file"
              accept="image/*"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setPhotoFile(file);
                // Reset so selecting the exact same file again (e.g. after
                // removing it) still fires onChange — same reasoning
                // FileAttachmentPicker's own onChange handler already gives.
                event.target.value = "";
              }}
            />
          </p>
          {photoFile && (
            <p>
              已選擇:<span>{photoFile.name}</span>({formatFileSize(photoFile.size)})
              <button type="button" onClick={() => setPhotoFile(null)} disabled={pending}>
                移除相片
              </button>
            </p>
          )}
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
