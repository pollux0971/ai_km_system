"use client";

import { useEffect, useRef, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { ANSWER_STATE_FALLBACK_CONTENT, ANSWER_STATE_LABELS, classifyAnswerState, type AnswerState } from "@/lib/answer-state";
import { simulateFileProcessing } from "@/lib/file-processing";
import { GENERATION_PHASE_LABELS, runGenerationPhases, type GenerationPhase } from "@/lib/generation-status";
import { listMessages, receiveAssistantReply, reviseMessage, sendMessage, submitAnswerFeedback, type AnswerFeedbackVerdict, type Message } from "@/lib/messages";
import { shouldSimulateStreamDisconnect, streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";
import { CitationPreviewDrawer } from "./citation-preview-drawer";
import { ConversationContextIndicator } from "./conversation-context-indicator";
import { MessageComposer } from "./message-composer";
import { MessageContent } from "./message-content";

const logger = createLogger("web:message-thread");

/**
 * E03-S009/S010: message thread. Owns the message list + renders
 * MessageComposer at the bottom, since submitting from the composer
 * needs to immediately affect what's displayed here — the defining
 * behavior S09's title names ("optimistic"): a sent message appears at
 * once as "pending" rather than waiting on the mock round-trip, then
 * reconciles to "sent" or "failed" once it resolves. This is a
 * deliberate contrast with S03-S05's selectors (ModeSwitch/
 * KnowledgeSelector/ModelSelector), which stay non-optimistic (disabled
 * while pending, UI only updates on confirmed success) — those are
 * infrequent settings changes where a brief pending state costs
 * nothing; a chat composer needs to feel instant on every message.
 *
 * A "failed"/"stream-failed" entry stays visible with a retry action
 * rather than vanishing — the Frontend/UX Boundary's "Optimistic UI 若
 * 涉及 mutation，失敗時必須 rollback 或明確 reconcile" is satisfied by
 * reconciling (the UI now accurately shows this message did NOT go
 * through) rather than a silent rollback that would leave the user
 * wondering whether their message ever existed.
 *
 * DisplayMessage is a local-only type: only "sent" entries have a real
 * persisted Message; every other kind is transient UI state that
 * doesn't survive a remount/reload — same accepted-limitation class as
 * every other sessionStorage-backed mock in this codebase.
 *
 * S10 adds the streaming pair (`streaming`/`stream-failed`), triggered
 * automatically once a user's own message finishes sending — see
 * startStream(). S13 renders citation badges within assistant content
 * via MessageContent (see message-content.tsx for why this is a plain
 * regex-parsed marker, not structured data). S14 adds the interaction:
 * clicking a badge sets `previewCitationId`, which drives a single
 * shared `CitationPreviewDrawer` rendered once at the bottom of this
 * component (not one drawer per message — there's only ever one
 * citation being previewed at a time for the whole thread). S21 "Answer
 * State" (ANSWERED/PARTIAL/NO_EVIDENCE/PERMISSION_DENIED/SOURCE_UNAVAILABLE/
 * ERROR) is a semantic
 * answer-quality classification that needs real RAG/permission
 * infrastructure to be meaningful — this story's own sent/streaming/
 * stream-failed states are a much simpler mechanical transport-layer
 * status, deliberately not reusing or partially implementing that enum.
 *
 * S11 "Generation Status" adds `phase` to the `streaming` entry — the
 * three lib/generation-status.ts phases (searching/reading/generating)
 * shown briefly before any reply text exists. Once real content starts
 * arriving from lib/streaming.ts, `phase` is cleared back to `null` —
 * the growing text itself is then the live indicator that generation
 * is still happening, so there's no dedicated post-"generating" phase.
 *
 * S12 "Stop Generation" adds a cancel control, live while `kind ===
 * "streaming"`. `stoppedRef` (a plain mutable Set, not state — stopping
 * doesn't itself need to trigger a render; the loops below notice it on
 * their own next iteration) tracks which in-flight localIds the user
 * asked to stop. runStream() checks it after every phase/chunk and
 * breaks out early. What happens next depends on whether any real text
 * had arrived yet: with content, the partial text is persisted through
 * the exact same receiveAssistantReply → reconcile-to-"sent" path a
 * natural completion uses (real chat products keep whatever was
 * generated so far rather than discarding it — stopping is "I have
 * enough," not "throw this away"); with no content yet (stopped during
 * the phase sequence, before any chunk arrived), there is nothing
 * meaningful to keep, so the entry is removed outright rather than
 * persisting an empty-content message.
 *
 * S17 "Multi-turn Conversation" makes turns strictly sequential:
 * `isTurnInFlight` (derived, not separate state — `pending`/`streaming`
 * entries are already tracked in `displayMessages`) disables
 * MessageComposer's submit while a previous turn hasn't settled yet,
 * matching the same "real chat products" precedent already used for
 * S12 (ChatGPT/Claude block sending a new message until the current
 * reply finishes or is stopped, rather than allowing overlapping
 * turns). Deliberately NOT extended to `failed`/`stream-failed` — those
 * are settled-but-unsuccessful states a user can retry OR simply move
 * past by sending something new, not an in-flight turn blocking
 * anything; nothing before S17 ever prevented that, and this story
 * doesn't add a new restriction there. Every message and its assistant
 * reply were already architecturally independent (own localId, own
 * stoppedRef entry, functional setDisplayMessages updates) before this
 * story — S17's own job is proving that holds across a REAL multi-turn
 * sequence (not just reasoning about it) and closing the one real gap
 * that let turns overlap in the first place.
 *
 * S18 adds `sentMessageCount` (also derived — counting only
 * `kind: "sent"` entries) driving `ConversationContextIndicator`,
 * rendered just above MessageComposer since it's informing the user
 * about what's available for the NEXT turn they're about to start.
 * See conversation-context-indicator.tsx for why this is a pure
 * display feature (the epic's own "indicator" wording), not a request
 * to wire real history into lib/streaming.ts's mock call. Suppressed
 * entirely while `displayMessages.length === 0` — EmptyState's "尚無
 * 訊息，開始對話吧。" already says there's nothing yet; showing the
 * indicator's own "上下文：目前尚無先前訊息。" alongside it would be
 * two differently-worded statements of the exact same fact at once.
 * Once at least one entry exists (even just a still-in-flight first
 * message, before anything has settled), the indicator reappears —
 * `sentMessageCount` can still legitimately read 0 at that point, and
 * that's meaningful information no longer competing with EmptyState.
 *
 * S19 "Regenerate Answer" adds a "重新產生" control on the LAST entry
 * only, and only when it's a settled (`kind: "sent"`) assistant reply
 * — distinct wording from S10's existing "重新產生回覆" (which retries
 * a *failed* stream) so the two never read as the same action; this
 * one redoes an already-*successful* reply the user wants a different
 * answer for. Deliberately restricted to the last entry: SOURCE_BASELINE
 * defines nothing about regenerating a message buried earlier in the
 * thread, and real chat products (the same precedent already used for
 * S12/S17) only ever offer this on the most recent reply — doing it
 * mid-thread would require inventing branching/discard semantics for
 * everything after it, which nothing asks for.
 *
 * S20 "Answer Revision" changes what happens when a regeneration
 * actually completes. SOURCE_BASELINE's only content for S20 is one
 * line: 「需留下 Revision」— the content being replaced must be
 * *retained*, not discarded. S19's original mechanism (delete the old
 * row, then let the reused runStream's receiveAssistantReply() call add
 * a brand new one) is incompatible with that: once the old row is
 * deleted there is nothing left to retain a revision history *on*. So
 * handleRegenerate() no longer deletes anything up front — it passes
 * the ORIGINAL Message object through to runStream(), which (via
 * `reviseTarget`) finalizes into reviseMessage() instead of
 * receiveAssistantReply() when present. reviseMessage() updates that
 * same row in place (same id, same position in the store) and pushes
 * the content being overwritten onto that row's `revisions` — so a
 * reload still shows exactly one entry per turn (Functional AC 5's "no
 * undefined duplicate side effect" still holds, now via update-in-place
 * rather than delete-then-recreate) while the prior content survives,
 * rendered via the "先前版本" `<details>` block below when a message's
 * `revisions` is non-empty.
 *
 * Not deleting up front also changes S19's documented stop-before-
 * content consequence, as a direct, necessary side effect of the new
 * mechanism (not an incidental unrelated fix): since the original row
 * is never touched until reviseMessage() actually runs, stopping a
 * regeneration before any content arrives now leaves the ORIGINAL reply
 * exactly as it was — runStream's empty-stop branch restores the
 * `streaming` entry back to `{ kind: "sent", message: reviseTarget }`
 * instead of S12/S19's plain "remove the entry" (which still applies,
 * unchanged, to a genuinely new turn's empty stop — see `reviseTarget`
 * being undefined there). This is a strict improvement enabled by the
 * architecture change, not a speculative addition: it falls directly
 * out of "don't touch the row until you have something to replace it
 * with," which S20's own "retain, don't discard" grounding already
 * requires.
 *
 * Old revisions render as plain text, not through MessageContent — they
 * are a historical record of what the answer used to say, not a live,
 * interactive current answer, so re-parsing citation markers `[N]` into
 * clickable buttons for no-longer-authoritative text would invent
 * interaction semantics nothing asks for. The `<details>` list uses
 * `<p>` per revision rather than `<ul>/<li>` deliberately — nesting
 * another `<li>` inside this thread's own top-level `<ul>` would collide
 * with every E2E spec's `page.getByRole("main").getByRole("listitem")`
 * scoping (see streaming-response.spec.ts's file doc comment for the
 * general version of this trap), silently inflating the message count
 * the moment any message had revisions.
 *
 * S21 "Answer state rendering" attaches one of 6 SOURCE_BASELINE-defined
 * states (ANSWERED/PARTIAL/NO_EVIDENCE/ERROR/PERMISSION_DENIED/
 * SOURCE_UNAVAILABLE — see lib/answer-state.ts) to every assistant reply
 * at the moment it's generated. `attemptSend` classifies the state from
 * the just-sent question via classifyAnswerState() and threads it
 * through startStream()→runStream() to the finalize call; regenerating
 * (handleRegenerate) reuses the ORIGINAL message's own `state` rather
 * than reclassifying — the underlying question hasn't changed, so the
 * mock's classification of it shouldn't either. `runStream`'s content-
 * accumulation step branches on whether ANSWER_STATE_FALLBACK_CONTENT
 * has an entry for the classified state: ANSWERED and PARTIAL both keep
 * the normal chunk-by-chunk streamAssistantReply() text (PARTIAL means
 * SOME real answer was given, just incomplete — still worth showing);
 * the other 4 states replace it outright with a fixed, honestly-labeled
 * placeholder sentence explaining why there's no real answer to show,
 * set in one synchronous step rather than streamed character-by-
 * character (there's nothing progressive about "no evidence found").
 * This keeps rendering trivial: content itself already IS whatever
 * should be shown, so the only new render logic is a short state-label
 * badge, shown whenever state isn't the default "ANSWERED" — the
 * common, unremarkable case renders exactly as it did before this
 * story, matching how real chat products only surface exceptional
 * states rather than badging every normal reply.
 *
 * S27 "Copy answer action" adds a "複製" button to EVERY settled
 * (`kind: "sent"`) assistant reply — unlike S19's regenerate, copying
 * is non-destructive and has no "only the last reply makes sense"
 * constraint, so it isn't restricted to `isLastEntry` (the same "real
 * chat product" precedent this file already leans on elsewhere: real
 * products let you copy any past reply, not just the latest one). The
 * epic's own title, "Copy ANSWER action", is itself the scope signal
 * that this applies to assistant replies only, not the user's own
 * messages — mirroring how S19's title already settled the
 * last-entry-only question for regenerate.
 *
 * `copyStatuses` tracks EVERY message's own independent copy state,
 * keyed by messageId (a `Map`, not one shared `{ messageId, status }`
 * slot) — an earlier version of this story used a single shared slot on
 * the (wrong) assumption that only one button's feedback is ever
 * visible at a time; an independent review demonstrated a real race:
 * two clicks on two different messages resolve their
 * `navigator.clipboard.writeText()` calls independently and in
 * whatever order the browser/promise scheduler happens to settle them,
 * so a single shared slot lets the LATER-RESOLVING call silently
 * overwrite or clear the OTHER message's already-shown confirmation,
 * and lets one message's revert timeout clear a completely different
 * message's state. Keying by messageId makes that structurally
 * impossible — each message's pending/copied/failed transition and its
 * own revert timeout (`copyResetTimeoutsRef`, also a `Map`) can only
 * ever touch its own entry, no matter what order concurrent writes
 * resolve in; both can legitimately show "已複製" at the same time,
 * which is also just correct — nothing about copying message A should
 * make message B's independent confirmation disappear.
 *
 * "已複製" auto-reverts to "複製" after a short delay — this is a
 * genuinely different shape from S26's `archive-conversation.tsx`
 * label-flip (which persists until the user clicks again, because
 * archived is a real persisted state); copying isn't a persisted state
 * at all, so leaving the button permanently reading "已複製" after the
 * fact would misrepresent it as one. `navigator.clipboard.writeText()`
 * can reject (insecure context, permission denial) — a `"failed"`
 * reading surfaces that distinctly via `role="alert"`, the same role
 * this file already uses for every other permanent-until-superseded
 * negative state (see the ERROR/PERMISSION_DENIED badge and the
 * stream-failed entry above) — never `role="status"`, which this
 * file's own doc comment already established is reserved for "still
 * busy" and is what every E2E spec's waitForThreadToSettle helper
 * polls to 0.
 *
 * S29 "File-processing status UI" inserts a processing step into
 * attemptSend, BEFORE sendMessage() itself, whenever the outgoing
 * message carries attachments — see lib/file-processing.ts for why
 * this needs its own deterministic mock trigger to make the failure
 * path reachable at all (no real E06 ingestion backend exists to
 * report a real outcome from). While processing, the existing
 * `pending` entry's status text switches from the generic "傳送中…" to
 * "檔案處理中…" — a distinct wording for a distinct wait, not two
 * unrelated things pretending to be the same. A new terminal kind,
 * `attachment-failed`, is added rather than reusing `failed` — S23/S26
 * already established this file's own precedent that reusing one
 * label for two different underlying causes (here: the FILES failed
 * to process vs. the MESSAGE failed to send) is actively misleading,
 * so it gets its own label ("檔案處理失敗") and its own retry wording
 * ("重新處理", distinct from "重新傳送") — sharing handleRetry's actual
 * mechanics is fine since retrying either one is the identical
 * "go back to pending, run attemptSend again" operation; only the
 * DISPLAY needs to stay distinct. Deterministic by design (same
 * attached filenames -> same classification every time, matching how
 * S21's answer-state triggers behave) — retrying with the exact same
 * file(s) fails the same way again, which is correct, not a bug.
 *
 * conversations/new-file/page.tsx (S28) reuses the same
 * classifyFileProcessing() check before creating anything, but without
 * this file's visible processing phase — see that module's own doc
 * comment for why a second, separate status UI there would be scope
 * creep this story never asked for.
 *
 * S31 "Stream disconnect/reconnect UX" — the story lib/streaming.ts's
 * own doc comment already flagged as unbuilt back at S10. A NEW
 * terminal kind, `stream-disconnected`, distinct from the existing
 * `stream-failed` — same "don't reuse one label for two different
 * causes" precedent as `attachment-failed` above: `stream-failed` is a
 * POST-stream persistence failure (the reply fully generated, then
 * receiveAssistantReply/reviseMessage failed to save it);
 * `stream-disconnected` is a MID-stream failure (the connection itself
 * dropped partway through generating). Confusing the two would mislead
 * about what actually happened and what retrying even means. Unlike
 * every other terminal kind in this file, this one carries the PARTIAL
 * content already received before the drop — S12 "Stop Generation"
 * already established the precedent that partial content a user was
 * mid-way through receiving should be preserved, not discarded, and a
 * disconnect is the same situation (the user already SAW that partial
 * text arrive) instead of a clean "never started" case. Also carries
 * the `answerState` it was streaming under (ANSWERED or PARTIAL — the
 * only two states that ever reach the real streaming loop at all;
 * every OTHER state's fixed fallback content is set synchronously
 * without ever calling streamAssistantReply, so disconnect structurally
 * cannot occur for them) so reconnecting can finalize with the SAME
 * classification, not silently default back to ANSWERED.
 *
 * Deliberately NOT wired into handleRegenerate — that handler only
 * ever receives the already-SETTLED assistant Message being
 * regenerated, never the original user question the disconnect trigger
 * needs to check against; inventing a way to thread that through would
 * be new plumbing nothing asked for, matching how handleRegenerate
 * already reuses the stored `state` rather than reclassifying from
 * content for the exact same reason (see this file's S21 section
 * above). Disconnect simulation therefore only applies to a genuinely
 * new turn (attemptSend -> startStream), which is also the only place
 * SOURCE_BASELINE-adjacent precedent (S21's classifyAnswerState, S29's
 * classifyFileProcessing) ever checks a fresh user question at all.
 *
 * S32 "Message retry UX" — like S31, SOURCE_BASELINE.md has no section
 * for this story either (E03's entries there still end at S30) and the
 * epic file's own S32 section is the same title-only MVP boilerplate
 * every late story gets. Unlike S31, there was no existing forward-
 * reference pre-naming this story — the scope instead comes directly
 * from this story's own generic Functional AC 5, shared by every story
 * in this epic file: "重複請求或重試可能發生，Then 不得造成未定義重複
 * side effect." Auditing the four existing retry/reconnect mechanisms
 * already in this file (`failed`/`attachment-failed` -> handleRetry,
 * `stream-disconnected` -> handleReconnect, `stream-failed` ->
 * handleRetryStream) against that AC found `handleRetryStream` in
 * violation: it called `runStream(localId)` with no further arguments,
 * silently discarding both the `answerState` the original attempt was
 * classified under AND — the actually serious part — `reviseTarget`.
 * Losing `reviseTarget` means retrying a `stream-failed` entry that
 * came from `handleRegenerate` (reviseMessage() failed to persist) no
 * longer revises the original message on retry; it falls through to
 * runStream's `receiveAssistantReply` branch instead and creates a
 * brand new one — an actual undefined duplicate side effect, the exact
 * thing AC 5 prohibits. `stream-failed` now carries the `answerState`
 * and `reviseTarget` that were in flight when persistence failed, and
 * handleRetryStream threads both back through, so a retried regenerate
 * still revises the same message and a retried non-ANSWERED turn keeps
 * its original classification — the same "reconnect finalizes under
 * the SAME classification it started under" principle S31 already
 * established for `stream-disconnected`, applied to the one place it
 * was missing.
 *
 * The other three mechanisms needed no change: `handleRetry` always
 * calls `attemptSend` fresh from the message's own `content`/
 * `attachmentNames`, which recomputes everything from scratch and never
 * carries a `reviseTarget` concept in the first place (`failed`/
 * `attachment-failed` only ever happen on a brand new send, never a
 * regenerate). `handleReconnect`/`stream-disconnected` has the identical
 * shape of gap in principle (it also hardcodes `reviseTarget` to
 * `undefined`) but it is NOT a reachable bug today: disconnect can only
 * occur when `simulateDisconnect` is true, and `handleRegenerate` never
 * passes that argument (see the S31 section above) — regenerating can
 * never disconnect, so there is no live path that would ever lose a
 * `reviseTarget` there. Extending it anyway would be a speculative,
 * unrequested change to code with no reachable failure to fix.
 *
 * `stream-failed` itself (S10/S12) has never had E2E coverage in this
 * codebase, for a structural reason unrelated to this story: its only
 * failure trigger is a stale/nonexistent id passed to
 * receiveAssistantReply/reviseMessage (see lib/messages.ts), which —
 * unlike S21/S29/S31's bracketed `[模擬:X]` triggers — has no path a
 * real UI interaction can produce (you cannot navigate to an invalid
 * conversation and still have a composer to type into). `failed`'s own
 * retry ("重新傳送") has the identical gap for the identical reason.
 * This story's fix and tests stay at the same unit level this whole
 * mechanism has always been verified at; inventing a new mock-trigger
 * mechanism just to force an E2E path here would be new scope nothing
 * asks for.
 *
 * E13-S001 "Answer OK feedback" adds a "有幫助" button to EVERY settled
 * (`kind: "sent"`) assistant reply, alongside S27's "複製" — SOURCE_BASELINE's
 * golden flow ends "...→ Show Citation → User Verify → OK / NG → Feedback
 * Loop", i.e. this reacts to an already-shown answer exactly like copying
 * does, not a new interaction shape. Unlike `copyStatuses` (purely
 * transient UI feedback that never survives a reload), the verdict itself
 * is real, persisted mutation state living on the `Message` row
 * (`feedback?: AnswerFeedbackVerdict`, see lib/messages.ts) — so once
 * given, the button is a disabled, differently-labeled "已回饋：有幫助"
 * rather than auto-reverting like "已複製" does; there's no "undo
 * feedback" AC, and reflecting `entry.message.feedback` directly (rather
 * than separate local state) means a reload showing the same persisted
 * value automatically renders the same disabled label with no extra
 * plumbing. `feedbackPendingIds`/`feedbackErrorIds` (both keyed by
 * messageId, same "no shared slot" precedent S27's independent review
 * already established for `copyStatuses`) track only the transient
 * in-flight/error UI, never the verdict itself.
 *
 * E13-S002 "Answer NG feedback" adds the sibling "沒有幫助" button right
 * next to it, sharing `handleFeedback` (now parameterized by verdict) and
 * the same `feedbackPendingIds`/`feedbackErrorIds` state — a message can
 * only ever have one feedback submission in flight at a time (both
 * buttons render disabled together while either is pending), so there is
 * no need for verdict-specific tracking. OK and NG are ONE verdict field,
 * not two independent toggles: once `entry.message.feedback` holds either
 * value, BOTH buttons become permanently disabled (`feedback != null`,
 * not `=== "OK"`), matching S001's own "no undo feedback" design applied
 * symmetrically now that a second button exists. Each button's own label
 * only flips to its "已回饋：..." form when it's the one that matches the
 * recorded verdict — the other stays at its plain label, just disabled,
 * so the UI never claims a verdict was given that wasn't.
 */
type DisplayMessage =
  | { kind: "sent"; message: Message }
  | { kind: "pending"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "failed"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "attachment-failed"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "streaming"; localId: string; content: string; phase: GenerationPhase | null }
  | { kind: "stream-failed"; localId: string; answerState: AnswerState; reviseTarget?: Message }
  | { kind: "stream-disconnected"; localId: string; content: string; answerState: AnswerState };

type LoadState = "loading" | "error" | "loaded";

export function MessageThread({ conversationId }: { conversationId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [previewCitationId, setPreviewCitationId] = useState<string | null>(null);
  const [copyStatuses, setCopyStatuses] = useState<Map<string, "pending" | "copied" | "failed">>(new Map());
  const [feedbackPendingIds, setFeedbackPendingIds] = useState<Set<string>>(new Set());
  const [feedbackErrorIds, setFeedbackErrorIds] = useState<Set<string>>(new Set());
  const stoppedRef = useRef<Set<string>>(new Set());
  const copyResetTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    // Captured once here (not read as `copyResetTimeoutsRef.current`
    // directly inside the cleanup) purely to satisfy
    // react-hooks/exhaustive-deps — `.current` is never reassigned
    // after mount (only mutated in place via .set()/.delete()), so this
    // is the same Map object either way.
    const timeouts = copyResetTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading messages", { correlationId, conversationId });

    listMessages(conversationId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        logger.error("failed to load messages", { correlationId, conversationId, code: result.error.code });
        setLoadState("error");
        return;
      }
      setDisplayMessages(result.value.map((message) => ({ kind: "sent", message })));
      setLoadState("loaded");
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function attemptSend(localId: string, content: string, attachmentNames: string[]) {
    const correlationId = crypto.randomUUID();

    if (attachmentNames.length > 0) {
      logger.info("processing attached files", { correlationId, conversationId, attachmentCount: attachmentNames.length });
      trackEvent("file_processing_attempt", { correlationId, properties: { conversationId, attachmentCount: attachmentNames.length } });

      const processingStatus = await simulateFileProcessing(attachmentNames);
      if (processingStatus === "failed") {
        logger.error("file processing failed", { correlationId, conversationId, attachmentCount: attachmentNames.length });
        trackEvent("file_processing_failure", { correlationId, properties: { conversationId } });
        setDisplayMessages((previous) =>
          previous.map((entry) => (entry.kind === "pending" && entry.localId === localId ? { ...entry, kind: "attachment-failed" } : entry)),
        );
        return;
      }

      logger.info("file processing succeeded", { correlationId, conversationId, attachmentCount: attachmentNames.length });
      trackEvent("file_processing_success", { correlationId, properties: { conversationId } });
    }

    logger.info("sending message", { correlationId, conversationId, length: content.length, attachmentCount: attachmentNames.length });
    trackEvent("conversation_message_send_attempt", {
      correlationId,
      properties: { conversationId, length: content.length, attachmentCount: attachmentNames.length },
    });

    const result = await sendMessage(conversationId, content, attachmentNames);

    if (!result.ok) {
      logger.error("failed to send message", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_message_send_failure", { correlationId, properties: { code: result.error.code } });
      setDisplayMessages((previous) =>
        previous.map((entry) => (entry.kind === "pending" && entry.localId === localId ? { ...entry, kind: "failed" } : entry)),
      );
      return;
    }

    logger.info("message sent", { correlationId, conversationId, messageId: result.value.id });
    trackEvent("conversation_message_send_success", { correlationId, properties: { messageId: result.value.id } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "pending" && entry.localId === localId ? { kind: "sent", message: result.value } : entry)),
    );

    startStream(classifyAnswerState(content), shouldSimulateStreamDisconnect(content));
  }

  function handleComposerSubmit(content: string, attachmentNames: string[]) {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) => [...previous, { kind: "pending", localId, content, attachmentNames }]);
    void attemptSend(localId, content, attachmentNames);
  }

  function handleRetry(localId: string, content: string, attachmentNames: string[]) {
    setDisplayMessages((previous) =>
      previous.map((entry) =>
        (entry.kind === "failed" || entry.kind === "attachment-failed") && entry.localId === localId
          ? { kind: "pending", localId, content, attachmentNames }
          : entry,
      ),
    );
    void attemptSend(localId, content, attachmentNames);
  }

  /**
   * E03-S010. streamAssistantReply() takes no "prompt" argument — the
   * mock always yields the same fixed placeholder text (see
   * lib/streaming.ts), so threading the user's message content through
   * here would be a dead parameter nothing reads yet. A real
   * implementation extending this later is exactly the kind of change
   * that belongs to whichever story actually wires up a real Model
   * Gateway call, not something to speculatively half-build now.
   *
   * `reviseTarget` (E03-S020): when present, this stream is regenerating
   * that specific already-settled message rather than answering a new
   * turn — see the file doc comment above for why that changes both the
   * empty-stop branch and the finalize call below.
   *
   * `answerState` (E03-S021): the mock classification (see
   * lib/answer-state.ts) this reply should finalize with, pre-computed
   * by the caller — runStream itself has no classification logic, only
   * the two behaviors that follow FROM a classification (skip streaming
   * in favor of fixed fallback content; persist the state).
   *
   * `simulateDisconnect` (E03-S031): pre-computed by the caller, same
   * shape as `answerState` — passed straight through to
   * streamAssistantReply(), which is the only thing that can actually
   * throw partway through. Defaults false so every pre-S031 caller
   * (there's exactly one direct call site missing this arg,
   * handleRetryStream below, which retries a `stream-failed` — a
   * DIFFERENT, post-stream failure that never went through disconnect
   * logic in the first place) keeps its exact prior behavior.
   */
  async function runStream(localId: string, reviseTarget?: Message, answerState: AnswerState = "ANSWERED", simulateDisconnect = false) {
    const correlationId = crypto.randomUUID();
    logger.info("streaming assistant reply", { correlationId, conversationId });
    trackEvent("conversation_message_stream_attempt", { correlationId, properties: { conversationId } });

    for await (const phase of runGenerationPhases()) {
      if (stoppedRef.current.has(localId)) break;
      setDisplayMessages((previous) =>
        previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { ...entry, phase } : entry)),
      );
    }
    // `phase` stays at its last value ("generating") here — NOT cleared
    // yet. Clearing it the instant the phase sequence exhausts (rather
    // than once real content actually arrives) would leave "generating"
    // visible for at most one render tick, regardless of how long the
    // gap before the first real chunk turns out to be — effectively
    // never SHOWING it despite that being this story's whole point.

    let accumulated = "";
    if (!stoppedRef.current.has(localId)) {
      const fallbackContent = ANSWER_STATE_FALLBACK_CONTENT[answerState];
      if (fallbackContent !== undefined) {
        accumulated = fallbackContent;
        setDisplayMessages((previous) =>
          previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { ...entry, content: accumulated, phase: null } : entry)),
        );
      } else {
        try {
          for await (const chunk of streamAssistantReply(undefined, simulateDisconnect)) {
            if (stoppedRef.current.has(localId)) break;
            accumulated += chunk;
            const snapshot = accumulated;
            setDisplayMessages((previous) =>
              previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { ...entry, content: snapshot, phase: null } : entry)),
            );
          }
        } catch {
          // E03-S031: streamAssistantReply is the only thing that can
          // throw inside this loop — see its own doc comment for why
          // that makes any caught error here unambiguously "the stream
          // disconnected," no distinguished error type needed. Partial
          // content already accumulated is preserved (S12's "keep what
          // was generated so far" precedent), not discarded.
          logger.error("stream disconnected", { correlationId, conversationId, length: accumulated.length });
          trackEvent("conversation_message_stream_disconnected", { correlationId, properties: { conversationId } });
          setDisplayMessages((previous) =>
            previous.map((entry) =>
              entry.kind === "streaming" && entry.localId === localId
                ? { kind: "stream-disconnected", localId, content: accumulated, answerState }
                : entry,
            ),
          );
          return;
        }
      }
    }

    const wasStopped = stoppedRef.current.delete(localId);

    if (wasStopped && accumulated.length === 0) {
      logger.info("generation stopped before any content arrived", { correlationId, conversationId });
      trackEvent("conversation_message_stream_stopped", { correlationId, properties: { conversationId, hadContent: false } });
      setDisplayMessages((previous) =>
        reviseTarget
          ? previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { kind: "sent", message: reviseTarget } : entry))
          : previous.filter((entry) => !(entry.kind === "streaming" && entry.localId === localId)),
      );
      return;
    }

    if (wasStopped) {
      logger.info("generation stopped, persisting partial content", { correlationId, conversationId, length: accumulated.length });
      trackEvent("conversation_message_stream_stopped", { correlationId, properties: { conversationId, hadContent: true } });
    }

    const result = reviseTarget
      ? await reviseMessage(reviseTarget.id, accumulated, answerState)
      : await receiveAssistantReply(conversationId, accumulated, answerState);

    if (!result.ok) {
      logger.error("failed to persist assistant reply", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_message_stream_failure", { correlationId, properties: { code: result.error.code } });
      setDisplayMessages((previous) =>
        previous.map((entry) =>
          entry.kind === "streaming" && entry.localId === localId ? { kind: "stream-failed", localId, answerState, reviseTarget } : entry,
        ),
      );
      return;
    }

    logger.info("assistant reply received", { correlationId, conversationId, messageId: result.value.id });
    trackEvent("conversation_message_stream_success", { correlationId, properties: { messageId: result.value.id } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { kind: "sent", message: result.value } : entry)),
    );
  }

  function startStream(answerState: AnswerState, simulateDisconnect = false) {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) => [...previous, { kind: "streaming", localId, content: "", phase: null }]);
    void runStream(localId, undefined, answerState, simulateDisconnect);
  }

  function handleRetryStream(localId: string, answerState: AnswerState, reviseTarget?: Message) {
    setDisplayMessages((previous) =>
      previous.map((entry) =>
        entry.kind === "stream-failed" && entry.localId === localId ? { kind: "streaming", localId, content: "", phase: null } : entry,
      ),
    );
    void runStream(localId, reviseTarget, answerState);
  }

  /**
   * E03-S031. Reconnecting restarts the stream from scratch — no real
   * transport exists to resume mid-stream from a partial position (see
   * lib/streaming.ts's own doc comment), and inventing a fake resume
   * capability would misrepresent what a real implementation could
   * honestly promise. Reuses the SAME answerState the original attempt
   * was streaming under (passed straight through, not reclassified) so
   * a reconnect finalizes consistently with what was originally
   * requested. Deterministic like every other mock trigger in this
   * codebase (S21/S29/S30) — reconnecting with the same underlying
   * trigger still present disconnects again, which is correct, not a
   * bug; `simulateDisconnect: true` is passed unconditionally because
   * reaching `stream-disconnected` at all is only possible when it was
   * already true.
   */
  function handleReconnect(localId: string, answerState: AnswerState) {
    setDisplayMessages((previous) =>
      previous.map((entry) =>
        entry.kind === "stream-disconnected" && entry.localId === localId ? { kind: "streaming", localId, content: "", phase: null } : entry,
      ),
    );
    void runStream(localId, undefined, answerState, true);
  }

  function handleStop(localId: string) {
    stoppedRef.current.add(localId);
  }

  function handleRegenerate(originalMessage: Message) {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "sent" && entry.message.id === originalMessage.id ? { kind: "streaming", localId, content: "", phase: null } : entry)),
    );
    void runStream(localId, originalMessage, originalMessage.state ?? "ANSWERED");
  }

  async function handleCopy(messageId: string, content: string) {
    const correlationId = crypto.randomUUID();
    logger.info("copying answer to clipboard", { correlationId, conversationId, messageId });
    trackEvent("conversation_answer_copy_attempt", { correlationId, properties: { conversationId, messageId } });

    const existingTimeout = copyResetTimeoutsRef.current.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      copyResetTimeoutsRef.current.delete(messageId);
    }
    setCopyStatuses((previous) => new Map(previous).set(messageId, "pending"));

    try {
      await navigator.clipboard.writeText(content);
      logger.info("copied answer to clipboard", { correlationId, conversationId, messageId });
      trackEvent("conversation_answer_copy_success", { correlationId, properties: { conversationId, messageId } });
      setCopyStatuses((previous) => new Map(previous).set(messageId, "copied"));
      copyResetTimeoutsRef.current.set(
        messageId,
        setTimeout(() => {
          setCopyStatuses((previous) => {
            const next = new Map(previous);
            next.delete(messageId);
            return next;
          });
          copyResetTimeoutsRef.current.delete(messageId);
        }, 2000),
      );
    } catch (error) {
      logger.error("failed to copy answer to clipboard", { correlationId, conversationId, messageId, error });
      trackEvent("conversation_answer_copy_failure", { correlationId, properties: { conversationId, messageId } });
      setCopyStatuses((previous) => new Map(previous).set(messageId, "failed"));
    }
  }

  async function handleFeedback(messageId: string, verdict: AnswerFeedbackVerdict) {
    const correlationId = crypto.randomUUID();
    logger.info("submitting answer feedback", { correlationId, conversationId, messageId, verdict });
    trackEvent("conversation_answer_feedback_attempt", { correlationId, properties: { conversationId, messageId, verdict } });

    setFeedbackPendingIds((previous) => new Set(previous).add(messageId));
    setFeedbackErrorIds((previous) => {
      if (!previous.has(messageId)) return previous;
      const next = new Set(previous);
      next.delete(messageId);
      return next;
    });

    const result = await submitAnswerFeedback(messageId, verdict);

    setFeedbackPendingIds((previous) => {
      const next = new Set(previous);
      next.delete(messageId);
      return next;
    });

    if (!result.ok) {
      logger.error("failed to submit answer feedback", { correlationId, conversationId, messageId, verdict, code: result.error.code });
      trackEvent("conversation_answer_feedback_failure", { correlationId, properties: { conversationId, messageId, verdict, code: result.error.code } });
      setFeedbackErrorIds((previous) => new Set(previous).add(messageId));
      return;
    }

    logger.info("answer feedback submitted", { correlationId, conversationId, messageId, verdict });
    trackEvent("conversation_answer_feedback_success", { correlationId, properties: { conversationId, messageId, verdict } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "sent" && entry.message.id === messageId ? { kind: "sent", message: result.value } : entry)),
    );
  }

  function handleCitationClick(citationId: string) {
    setPreviewCitationId(citationId);
  }

  function handleClosePreview() {
    setPreviewCitationId(null);
  }

  const isTurnInFlight = displayMessages.some((entry) => entry.kind === "pending" || entry.kind === "streaming");
  const sentMessageCount = displayMessages.filter((entry) => entry.kind === "sent").length;

  if (loadState === "loading") {
    return (
      <div style={{ marginTop: 16 }}>
        <LoadingIndicator />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ marginTop: 16 }}>
        <ErrorMessage message="無法載入訊息。" />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      {displayMessages.length === 0 ? (
        <EmptyState message="尚無訊息，開始對話吧。" />
      ) : (
        <ul>
          {displayMessages.map((entry, index) => {
            const isLastEntry = index === displayMessages.length - 1;

            if (entry.kind === "stream-failed") {
              return (
                <li key={entry.localId}>
                  <span>AI</span>
                  <span role="alert">AI 回覆失敗</span>
                  <button type="button" onClick={() => handleRetryStream(entry.localId, entry.answerState, entry.reviseTarget)}>
                    重新產生回覆
                  </button>
                </li>
              );
            }

            const key = entry.kind === "sent" ? entry.message.id : entry.localId;
            const role =
              entry.kind === "sent" ? entry.message.role : entry.kind === "streaming" || entry.kind === "stream-disconnected" ? "assistant" : "user";
            const roleLabel = role === "assistant" ? "AI" : "你";
            const content = entry.kind === "sent" ? entry.message.content : entry.content;
            const attachmentNames =
              entry.kind === "sent" ? entry.message.attachmentNames : entry.kind === "streaming" || entry.kind === "stream-disconnected" ? [] : entry.attachmentNames;
            const revisions = entry.kind === "sent" ? (entry.message.revisions ?? []) : [];
            const answerState: AnswerState = entry.kind === "sent" ? (entry.message.state ?? "ANSWERED") : "ANSWERED";

            return (
              <li key={key}>
                <span>{roleLabel}</span>
                <span>
                  <MessageContent content={content} withCitations={role === "assistant"} onCitationClick={handleCitationClick} />
                </span>
                {entry.kind === "sent" &&
                  role === "assistant" &&
                  (answerState === "ERROR" || answerState === "PERMISSION_DENIED" ? (
                    // role="alert" (assertive), not "status" — this badge is
                    // PERMANENT on a settled reply, not a transient in-flight
                    // indicator. Every E2E spec's waitForThreadToSettle
                    // helper treats any role="status" inside <main> as "still
                    // busy" and waits for its count to hit 0 — reusing that
                    // role here would make settling wait forever once a
                    // reply lands in one of these two states. "alert" is
                    // already how this exact file marks stream-failed (also
                    // a permanent, settled negative state) without that
                    // collision.
                    <span role="alert">{ANSWER_STATE_LABELS[answerState]}</span>
                  ) : (
                    answerState !== "ANSWERED" && <span>{ANSWER_STATE_LABELS[answerState]}</span>
                  ))}
                {attachmentNames.length > 0 && <span>（附件：{attachmentNames.join("、")}）</span>}
                {entry.kind === "sent" && role === "assistant" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(entry.message.id, content)}
                      disabled={copyStatuses.get(entry.message.id) === "pending"}
                    >
                      {copyStatuses.get(entry.message.id) === "copied" ? "已複製" : "複製"}
                    </button>
                    {copyStatuses.get(entry.message.id) === "failed" && <span role="alert">複製失敗，請手動選取複製。</span>}
                    <button
                      type="button"
                      onClick={() => handleFeedback(entry.message.id, "OK")}
                      disabled={entry.message.feedback != null || feedbackPendingIds.has(entry.message.id)}
                    >
                      {entry.message.feedback === "OK" ? "已回饋：有幫助" : "有幫助"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(entry.message.id, "NG")}
                      disabled={entry.message.feedback != null || feedbackPendingIds.has(entry.message.id)}
                    >
                      {entry.message.feedback === "NG" ? "已回饋：沒有幫助" : "沒有幫助"}
                    </button>
                    {feedbackErrorIds.has(entry.message.id) && <span role="alert">回饋送出失敗，請再試一次。</span>}
                  </>
                )}
                {entry.kind === "sent" && role === "assistant" && isLastEntry && (
                  <button type="button" onClick={() => handleRegenerate(entry.message)}>
                    重新產生
                  </button>
                )}
                {entry.kind === "sent" && role === "assistant" && revisions.length > 0 && (
                  <details>
                    <summary>先前版本（{revisions.length}）</summary>
                    {revisions.map((revisionContent, revisionIndex) => (
                      <p key={revisionIndex}>{revisionContent}</p>
                    ))}
                  </details>
                )}
                {entry.kind === "pending" && (
                  <span role="status">{entry.attachmentNames.length > 0 ? "檔案處理中…" : "傳送中…"}</span>
                )}
                {entry.kind === "streaming" && (
                  <span>
                    <span role="status">{entry.phase ? GENERATION_PHASE_LABELS[entry.phase] : "AI 回覆中…"}</span>
                    <button type="button" onClick={() => handleStop(entry.localId)}>
                      停止生成
                    </button>
                  </span>
                )}
                {entry.kind === "stream-disconnected" && (
                  <span>
                    <span role="alert">連線中斷</span>
                    <button type="button" onClick={() => handleReconnect(entry.localId, entry.answerState)}>
                      重新連線
                    </button>
                  </span>
                )}
                {entry.kind === "attachment-failed" && (
                  <span>
                    <span role="alert">檔案處理失敗</span>
                    <button type="button" onClick={() => handleRetry(entry.localId, entry.content, entry.attachmentNames)}>
                      重新處理
                    </button>
                  </span>
                )}
                {entry.kind === "failed" && (
                  <span>
                    <span role="alert">傳送失敗</span>
                    <button type="button" onClick={() => handleRetry(entry.localId, entry.content, entry.attachmentNames)}>
                      重新傳送
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <CitationPreviewDrawer citationId={previewCitationId} onClose={handleClosePreview} />
      {displayMessages.length > 0 && <ConversationContextIndicator messageCount={sentMessageCount} />}
      <MessageComposer conversationId={conversationId} onSubmit={handleComposerSubmit} disabled={isTurnInFlight} />
    </div>
  );
}
