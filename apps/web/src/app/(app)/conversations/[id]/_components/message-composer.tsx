"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { trackEvent } from "@/lib/telemetry";
import { FileAttachmentPicker } from "./file-attachment-picker";

const logger = createLogger("web:message-composer");

/**
 * E03-S006/S007/S008: message composer. SOURCE_BASELINE.md's E03
 * outline gives these stories only their titles ("E03-S06 Message
 * Composer", "E03-S07 Multi-line Input", "E03-S08 File Attachment") —
 * no message/entity field shape, no send semantics, no character/size/
 * type/count limit is defined anywhere in AI_KM_BMAD_High_Granularity/.
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
 */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const isValid = draft.trim().length > 0 || attachments.length > 0;

  function submitDraft() {
    if (!isValid) return;

    const correlationId = crypto.randomUUID();
    logger.info("message draft submitted", {
      correlationId,
      conversationId,
      length: draft.trim().length,
      attachmentCount: attachments.length,
    });
    // Length/count only — never the raw draft text or attachment file
    // names, which may contain arbitrary/sensitive user content (AC7:
    // audit payload must not contain raw sensitive content).
    trackEvent("conversation_message_compose_submit", {
      correlationId,
      properties: { conversationId, length: draft.trim().length, attachmentCount: attachments.length },
    });

    setDraft("");
    setAttachments([]);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && isValid) {
      event.preventDefault();
      submitDraft();
    }
  }

  function handleFilesSelected(fileList: FileList) {
    setAttachments((previous) => [...previous, ...Array.from(fileList)]);
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((previous) => previous.filter((_, i) => i !== index));
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
      <label htmlFor={inputId}>訊息</label>
      <br />
      <textarea
        id={inputId}
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="輸入訊息…（Enter 送出，Shift+Enter 換行）"
      />
      <br />
      <FileAttachmentPicker files={attachments} onFilesSelected={handleFilesSelected} onRemove={handleRemoveAttachment} />
      <button type="submit" disabled={!isValid}>
        送出
      </button>
    </form>
  );
}
