"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createLogger } from "@ai-km/logger";
import { trackEvent } from "@/lib/telemetry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { FileAttachmentPicker } from "./file-attachment-picker";
import { VoiceInputButton } from "./voice-input-button";

const logger = createLogger("web:message-composer");

/**
 * E03-S006/S007/S008: message composer. SOURCE_BASELINE.md's E03
 * outline gives these stories only their titles ("E03-S06 Message
 * Composer", "E03-S07 Multi-line Input", "E03-S08 File Attachment") —
 * no message/entity field shape, no send semantics, no character/size/
 * type/count limit is defined anywhere in archive/AI_KM_BMAD_High_Granularity/.
 * The epic file's own expanded title for the remaining story makes the
 * boundary explicit: S09 "Send-message optimistic state" (actually
 * persisting a message and showing pending/sent/failed — the Message
 * entity itself is E04-S02, Team B, and doesn't exist yet). This
 * component is deliberately scoped to only the composer's own
 * input/validation/reset lifecycle — it does NOT persist or upload
 * anything, since no message list/history or upload backend exists yet
 * (and Frontend/BFF may never connect directly to Object Storage
 * regardless — E03's own Development Boundaries). Submitting a valid
 * draft only proves the composer clears itself and is ready for the
 * next message; wiring that up to a real send is S09's explicit job.
 *
 * Fully self-contained (no lib/conversations.ts changes needed) — a
 * signal this is a properly-scoped, genuinely independent atomic slice.
 *
 * S07 upgrades S06's single-line `<input>` to a multi-line `<textarea>`
 * — same single→multi-stage upgrade pattern as S03→S04's Knowledge
 * Selector. Enter submits (mirroring S06's `<input>`, which natively
 * submitted its form on Enter); Shift+Enter inserts a newline instead —
 * that half needs no handler at all, since a plain `<textarea>` already
 * inserts a newline on any Enter unless JS calls preventDefault(), so
 * leaving Shift+Enter untouched is what makes it "just work". Enter is
 * only intercepted (preventDefault + submit) when there's a valid draft
 * to submit; on an empty/whitespace-only draft, plain Enter is left to
 * behave natively too — blocking it there would silently swallow the
 * keystroke instead of submitting OR inserting anything, which would
 * feel broken rather than fail-closed.
 *
 * S08 adds `attachments` — owned here (not inside FileAttachmentPicker)
 * since selected files are part of the same draft that submits/clears
 * together with the typed text, not an independently-persisted field.
 * A draft is now valid if it has text OR at least one attachment (a
 * photo-only message with no caption is a normal, expected case, same
 * as most chat apps) — mirrors S06/S07's isValid, just widened.
 *
 * S09 adds the optional `onSubmit` prop, called after this component's
 * own validation/telemetry/clear succeeds — MessageComposer keeps
 * owning its existing `conversation_message_compose_submit` UI-level
 * event (did the user interact with the compose control) unchanged;
 * `onSubmit` lets a parent (message-thread.tsx) layer the actual
 * domain-level send (optimistic add, sendMessage() call, pending/sent/
 * failed reconciliation) on top without MessageComposer needing to know
 * any of that exists. Optional and additive — every S06-S08 test that
 * doesn't pass it keeps passing unchanged.
 *
 * E03-S017 adds the optional `disabled` prop — turns must happen
 * sequentially (matching the near-universal chat-product convention of
 * blocking a new send while the previous reply is still in flight,
 * same "real chat products" precedent already used for S012's stop
 * behavior), not overlapping. Composed with `isValid` into `canSubmit`
 * rather than disabling the whole `<textarea>` — the user can still
 * type/attach ahead while waiting, only actually SENDING is blocked,
 * matching how ChatGPT/Claude's input stays live during generation and
 * only the send action itself is gated. Defaults to `false` so every
 * pre-S017 test that doesn't pass it keeps passing unchanged.
 *
 * E03-S041 adds push-to-talk voice input (`voice_input` flag; hidden
 * entirely when off, per AC1). `submitDraft()` is refactored into
 * `submitDraftWith(content)` so the voice flow's auto-submit path
 * (recognized text + empty draft) reuses the exact same validation/
 * telemetry/clear logic as a typed Enter/送出 — not a second, divergent
 * copy of it. `onVoiceTranscript` is NOT a new external prop (spec:
 * "不外露"): it's `<VoiceInputButton>`'s own `onTranscript` prop, wired
 * to an internal handler here — MessageComposer's public API is
 * unchanged.
 */
export function MessageComposer({
  conversationId,
  onSubmit,
  disabled = false,
  accessory,
}: {
  conversationId: string;
  onSubmit?: (content: string, attachmentNames: string[]) => void;
  disabled?: boolean;
  /**
   * ux/enterprise-polish: optional extra control rendered in the action
   * row beside 送出 (the conversation-mode menu). Optional so every
   * existing call site/test keeps its exact previous rendering.
   */
  accessory?: ReactNode;
}) {
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const isValid = draft.trim().length > 0 || attachments.length > 0;
  const canSubmit = isValid && !disabled;

  function submitDraftWith(content: string) {
    const trimmed = content.trim();
    const valid = trimmed.length > 0 || attachments.length > 0;
    if (!valid || disabled) return;

    const correlationId = crypto.randomUUID();
    logger.info("message draft submitted", {
      correlationId,
      conversationId,
      length: trimmed.length,
      attachmentCount: attachments.length,
    });
    // Length/count only — never the raw draft text or attachment file
    // names, which may contain arbitrary/sensitive user content (AC7:
    // audit payload must not contain raw sensitive content).
    trackEvent("conversation_message_compose_submit", {
      correlationId,
      properties: { conversationId, length: trimmed.length, attachmentCount: attachments.length },
    });

    onSubmit?.(
      trimmed,
      attachments.map((file) => file.name),
    );

    setDraft("");
    setAttachments([]);
    setVoiceHint(null);
  }

  function submitDraft() {
    submitDraftWith(draft);
  }

  /**
   * `<VoiceInputButton>`'s `onTranscript` — called only with non-empty
   * recognized text (spec AC3/AC4: empty text is the button's own
   * "沒有辨識到內容" concern, never reaches here). Returns whether this
   * auto-submitted (true) or appended to an existing draft instead
   * (false) — the button needs that to report `autoSent` on its own
   * `conversation_voice_transcribe_success` telemetry.
   */
  function handleVoiceTranscript(text: string): boolean {
    if (draft.trim().length === 0) {
      submitDraftWith(text);
      return true;
    }
    setDraft((previous) => `${previous} ${text}`);
    setVoiceHint("已加入語音文字，請確認後送出");
    textareaRef.current?.focus();
    return false;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && canSubmit) {
      event.preventDefault();
      submitDraft();
    }
  }

  function handleFilesSelected(fileList: FileList) {
    // Snapshot synchronously, before scheduling the state update — see
    // 99d9bc2/E03-S028 (new-file/page.tsx's handleFilesSelected) for the
    // race this avoids: fileList is the same live FileList the input
    // element owns, and FileAttachmentPicker resets `input.value = ""`
    // right after this callback returns, clearing that live list in
    // place. Reading it lazily inside the updater risked observing it
    // already empty.
    const selectedFiles = Array.from(fileList);
    setAttachments((previous) => [...previous, ...selectedFiles]);
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((previous) => previous.filter((_, i) => i !== index));
  }

  return (
    <form onSubmit={handleSubmit} className="chat-composer">
      <label htmlFor={inputId} className="visually-hidden">
        訊息
      </label>
      <textarea
        id={inputId}
        ref={textareaRef}
        rows={3}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setVoiceHint(null);
        }}
        onKeyDown={handleKeyDown}
        placeholder="輸入訊息…（Enter 送出，Shift+Enter 換行）"
      />
      {voiceHint && <p aria-live="polite">{voiceHint}</p>}
      <div className="composer-actions">
        <FileAttachmentPicker files={attachments} onFilesSelected={handleFilesSelected} onRemove={handleRemoveAttachment} />
        {isFeatureEnabled("voice_input") && (
          <VoiceInputButton conversationId={conversationId} disabled={disabled} onTranscript={handleVoiceTranscript} />
        )}
        {accessory}
        <button type="submit" disabled={!canSubmit}>
          送出
        </button>
      </div>
    </form>
  );
}
