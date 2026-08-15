"use client";

import { useEffect, useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import {
  completeDiagnosticSession,
  escalateDiagnosticSession,
  goToPreviousStep,
  restartDiagnosticSession,
  selectDecisionOption,
  skipDiagnosticStep,
  type DiagnosticSession,
} from "@/lib/diagnostic-sessions";
import { explainDiagnosticStep } from "@/lib/diagnostic-explanations";
import { getDiagnosticStepCitation, type SopCitation } from "@/lib/diagnostic-citations";
import type { DiagnosticStep } from "@/lib/diagnostic-steps";
import { submitKnowledgeCandidate } from "@/lib/knowledge-candidates";
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
 *
 * `step.safetyWarning` (E07-S016 "Safety warning component") is rendered
 * with `role="alert"`, eagerly and unconditionally whenever present —
 * deliberately NOT a toggle like AI 說明/SOP 引用來源, and deliberately NOT
 * gated on `sessionId` either (see diagnostic-steps.ts's own doc comment
 * for the full reasoning): a safety warning is content the user must see,
 * not optional content they might choose to explore, so it needs neither a
 * click to reveal it nor an active session to justify showing it. No local
 * state of its own — it's a pure, already-known field on `step`, nothing
 * to fetch or cache. This story does not block the option/skip buttons on
 * acknowledging the warning; that's E07-S017's own separate scope.
 *
 * The 我已閱讀並了解上述安全警告 checkbox (E07-S017 "High-risk confirmation
 * gate") reuses `step.safetyWarning`'s own presence as the "this step is
 * high-risk" signal, rather than inventing a second, separate flag that
 * could drift out of sync with it — a step that needs confirming is
 * exactly a step with a warning to confirm, one concept, not two. Gates
 * the option buttons AND 跳過此步驟 (both mean "proceeding past this step")
 * via `safetyGateBlocking`, computed once and reused across both; does
 * NOT gate 上一步/重新開始 (retreating/resetting, not proceeding into risk)
 * nor AI 說明/SOP 引用來源 (reading more information should never be
 * blocked). `handleSelect`/`handleSkip` both also early-return on
 * `safetyGateBlocking` — real HTML `disabled` already prevents the click
 * from firing at all, but the extra guard matches this file's own general
 * habit of layering a defensive check even when the outer one is already
 * sufficient (see e.g. `goToPreviousStep`'s client+server pair for a
 * bigger version of the same instinct, though this one is UI-only: there
 * is no real authorization boundary being enforced here, no server-side
 * mirror of this guard exists or is warranted — same "UI hiding is UX
 * only" scoping this codebase already reserves for genuine permission
 * checks, not extended to this purely local safety nudge). Pure local
 * `safetyAcknowledged` boolean, reversible (unchecking re-blocks), reset
 * on `step.stepIndex` change same as every other transient UI state
 * above — returning to a high-risk step (上一步/重新開始) must require
 * re-acknowledging it, not silently carry over a stale confirmation from
 * before.
 *
 * The 升級此案例 button + 升級原因 textarea (E07-S018 "Escalation action")
 * are session-level (gated on `sessionId` alone, like 重新開始) and
 * available on every step, not just ones with options — escalating the
 * whole case isn't a step-level decision. Shares the shared `pending`/
 * `error` state with select/back/restart/skip (structurally the same
 * "one mutation in flight" concern those four already share, see this
 * file's own top doc comment) — escalating is a real mutation, unlike AI
 * 說明/SOP 引用來源's non-mutating reads or the safety checkbox's pure
 * local state. Deliberately NOT gated behind `safetyGateBlocking` — see
 * escalateDiagnosticSession's own doc comment for why requiring
 * "acknowledge the danger first" would be backwards for an action whose
 * whole point is asking for help with it. Once `recordedEscalationReason`
 * is set, the button/textarea are replaced by a recorded-value display
 * (same "an input with no visible effect anywhere would be a write-only
 * void" pattern `recordedDetail` above already establishes) — reusing its
 * own presence as the gate is safe because a reason is always set together
 * with `status: "ESCALATED"` (see escalateDiagnosticSession), so there's
 * no need for a separate `sessionStatus` prop just to know whether to hide
 * the escalation UI.
 *
 * The 候選內容 textarea + 提交為知識候選 button (E07-S023 "Knowledge
 * candidate submission") reuse `sessionAlreadyTerminal` too, but as a
 * MINIMUM condition, not the only one — submitting a candidate makes
 * sense once the case has reached an outcome either way (resolved or
 * escalated both plausibly teach something worth capturing), so this
 * block is additionally gated on `maintenanceCaseId` being present
 * (passed down by maintenance-session.tsx, since a knowledge candidate
 * belongs to the CASE, not the diagnostic session — see
 * knowledge-candidates.ts's own doc comment for why it's a fully
 * separate entity from DiagnosticSession). Unlike escalate/complete,
 * submitting a candidate does NOT change `sessionAlreadyTerminal`'s own
 * value (it doesn't touch DiagnosticSession at all), so once the form
 * appears it stays available until a submission actually succeeds —
 * there's no risk of it flickering based on session state the way the
 * escalate/complete forms' own mutual-hiding logic must guard against.
 * `submittedCandidateContent` is local-only state (not threaded back
 * through `onAdvanced`, since submitKnowledgeCandidate returns a
 * KnowledgeCandidate, not a DiagnosticSession — a genuinely different
 * return shape from every other mutation in this file) — it takes over
 * from `recordedKnowledgeCandidate` the moment a submission succeeds, so
 * the form disappears immediately without waiting on a parent refetch
 * that wouldn't even carry this value anyway.
 *
 * The 解決此案例 button + 解決摘要 textarea (E07-S019 "Completion summary")
 * are `escalateDiagnosticSession`'s structural twin for the opposite
 * terminal outcome — same session-level gating, same shared `pending`/
 * `error`, same "not gated behind `safetyGateBlocking`" reasoning, same
 * "own recorded value's presence gates the UI" pattern. The one new
 * wrinkle: since a session can now reach two DIFFERENT terminal states
 * from this same component, each action's form is hidden once EITHER
 * `recordedEscalationReason` OR `recordedCompletionSummary` is set, not
 * just its own — `sessionAlreadyTerminal` below captures this once,
 * reused by both, rather than each form only checking its own recorded
 * value (which would otherwise let a resolved case still show a live
 * "升級此案例" form, or vice versa).
 */
export default function CurrentStepCard({
  sessionId,
  maintenanceCaseId,
  step,
  onAdvanced,
  recordedDetail,
  recordedSkipReason,
  recordedPhotoFileName,
  recordedPhotoSizeBytes,
  recordedEscalationReason,
  recordedCompletionSummary,
  recordedKnowledgeCandidate,
}: {
  sessionId?: string;
  maintenanceCaseId?: string;
  step: DiagnosticStep;
  onAdvanced?: (session: DiagnosticSession) => void;
  recordedDetail?: string;
  recordedSkipReason?: string;
  recordedPhotoFileName?: string;
  recordedPhotoSizeBytes?: number;
  recordedEscalationReason?: string;
  recordedCompletionSummary?: string;
  recordedKnowledgeCandidate?: string;
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
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [completionSummary, setCompletionSummary] = useState("");
  const [candidateContent, setCandidateContent] = useState("");
  const [submittedCandidateContent, setSubmittedCandidateContent] = useState<string | null>(null);
  const detailFieldId = useId();
  const skipFieldId = useId();
  const photoFieldId = useId();
  const safetyFieldId = useId();
  const escalationFieldId = useId();
  const completionFieldId = useId();
  const candidateFieldId = useId();
  const safetyGateBlocking = Boolean(step.safetyWarning) && !safetyAcknowledged;
  const sessionAlreadyTerminal = Boolean(recordedEscalationReason) || Boolean(recordedCompletionSummary);
  const displayedCandidate = submittedCandidateContent ?? recordedKnowledgeCandidate;

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
    setSafetyAcknowledged(false);
    setEscalationReason("");
    setCompletionSummary("");
    setCandidateContent("");
  }, [step.stepIndex]);

  function handleToggleSafetyAcknowledged() {
    const next = !safetyAcknowledged;
    setSafetyAcknowledged(next);
    const correlationId = crypto.randomUUID();
    logger.info("safety warning acknowledgment toggled", { correlationId, stepIndex: step.stepIndex, acknowledged: next });
    trackEvent("maintenance_session_safety_warning_acknowledged", { correlationId, properties: { stepIndex: step.stepIndex, acknowledged: next } });
  }

  async function handleSelect(optionId: string) {
    if (pending || !sessionId || safetyGateBlocking) return;

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
    if (pending || !sessionId || !trimmedReason || safetyGateBlocking) return;

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

  async function handleEscalate() {
    const trimmedReason = escalationReason.trim();
    if (pending || !sessionId || !trimmedReason) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("escalating diagnostic session", { correlationId, sessionId });
    trackEvent("maintenance_session_escalate_attempt", { correlationId, properties: { sessionId } });

    const result = await escalateDiagnosticSession(sessionId, trimmedReason);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to escalate diagnostic session", { correlationId, sessionId, code: result.error.code });
      trackEvent("maintenance_session_escalate_failure", { correlationId, properties: { sessionId, code: result.error.code } });
      setError(result.error.message);
      return;
    }

    logger.info("diagnostic session escalated", { correlationId, sessionId });
    trackEvent("maintenance_session_escalate_success", { correlationId, properties: { sessionId } });
    onAdvanced?.(result.value);
  }

  async function handleComplete() {
    const trimmedSummary = completionSummary.trim();
    if (pending || !sessionId || !trimmedSummary) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("completing diagnostic session", { correlationId, sessionId });
    trackEvent("maintenance_session_complete_attempt", { correlationId, properties: { sessionId } });

    const result = await completeDiagnosticSession(sessionId, trimmedSummary);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to complete diagnostic session", { correlationId, sessionId, code: result.error.code });
      trackEvent("maintenance_session_complete_failure", { correlationId, properties: { sessionId, code: result.error.code } });
      setError(result.error.message);
      return;
    }

    logger.info("diagnostic session completed", { correlationId, sessionId });
    trackEvent("maintenance_session_complete_success", { correlationId, properties: { sessionId } });
    onAdvanced?.(result.value);
  }

  async function handleSubmitCandidate() {
    const trimmedContent = candidateContent.trim();
    if (pending || !maintenanceCaseId || !trimmedContent) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("submitting knowledge candidate", { correlationId, maintenanceCaseId });
    trackEvent("maintenance_session_knowledge_candidate_submit_attempt", { correlationId, properties: { maintenanceCaseId } });

    const result = await submitKnowledgeCandidate(maintenanceCaseId, trimmedContent);

    setPending(false);
    if (!result.ok) {
      logger.error("failed to submit knowledge candidate", { correlationId, maintenanceCaseId, code: result.error.code });
      trackEvent("maintenance_session_knowledge_candidate_submit_failure", {
        correlationId,
        properties: { maintenanceCaseId, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    logger.info("knowledge candidate submitted", { correlationId, maintenanceCaseId });
    trackEvent("maintenance_session_knowledge_candidate_submit_success", { correlationId, properties: { maintenanceCaseId } });
    setSubmittedCandidateContent(result.value.content);
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
      {step.safetyWarning && (
        <p role="alert">
          安全警告:<span>{step.safetyWarning}</span>
        </p>
      )}
      {step.safetyWarning && (
        <p>
          <label htmlFor={safetyFieldId}>
            <input
              id={safetyFieldId}
              type="checkbox"
              checked={safetyAcknowledged}
              onChange={handleToggleSafetyAcknowledged}
            />
            我已閱讀並了解上述安全警告
          </label>
        </p>
      )}
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
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                disabled={pending || safetyGateBlocking}
                style={{ marginRight: 8 }}
              >
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
            <button type="button" onClick={handleSkip} disabled={pending || !skipReason.trim() || safetyGateBlocking}>
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
      {recordedEscalationReason && (
        <p>
          已升級此案例,原因:<span>{recordedEscalationReason}</span>
        </p>
      )}
      {sessionId && !sessionAlreadyTerminal && (
        <>
          <p>
            <label htmlFor={escalationFieldId}>升級原因</label>
            <br />
            <textarea
              id={escalationFieldId}
              value={escalationReason}
              onChange={(event) => setEscalationReason(event.target.value)}
              disabled={pending}
            />
          </p>
          <p>
            <button type="button" onClick={handleEscalate} disabled={pending || !escalationReason.trim()}>
              升級此案例
            </button>
          </p>
        </>
      )}
      {recordedCompletionSummary && (
        <p>
          已解決此案例,摘要:<span>{recordedCompletionSummary}</span>
        </p>
      )}
      {sessionId && !sessionAlreadyTerminal && (
        <>
          <p>
            <label htmlFor={completionFieldId}>解決摘要</label>
            <br />
            <textarea
              id={completionFieldId}
              value={completionSummary}
              onChange={(event) => setCompletionSummary(event.target.value)}
              disabled={pending}
            />
          </p>
          <p>
            <button type="button" onClick={handleComplete} disabled={pending || !completionSummary.trim()}>
              解決此案例
            </button>
          </p>
        </>
      )}
      {displayedCandidate && (
        <p>
          已提交知識候選:<span>{displayedCandidate}</span>
        </p>
      )}
      {sessionId && maintenanceCaseId && sessionAlreadyTerminal && !displayedCandidate && (
        <>
          <p>
            <label htmlFor={candidateFieldId}>候選內容</label>
            <br />
            <textarea
              id={candidateFieldId}
              value={candidateContent}
              onChange={(event) => setCandidateContent(event.target.value)}
              disabled={pending}
            />
          </p>
          <p>
            <button type="button" onClick={handleSubmitCandidate} disabled={pending || !candidateContent.trim()}>
              提交為知識候選
            </button>
          </p>
        </>
      )}
      {error && <ErrorMessage message={error} />}
    </section>
  );
}
