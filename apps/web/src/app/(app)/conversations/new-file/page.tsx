"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { createConversation, deleteConversation } from "@/lib/conversations";
import { sendMessage } from "@/lib/messages";
import { trackEvent } from "@/lib/telemetry";
import { FileAttachmentPicker } from "../[id]/_components/file-attachment-picker";

const logger = createLogger("web:file-chat-entry");

type State = { status: "idle" } | { status: "creating" } | { status: "error" };

/**
 * E03-S028 "File-chat entry flow". SOURCE_BASELINE.md gives this story
 * only a bare title, "E03-S28 File Chat"; the epic's expanded title
 * ("File-chat entry flow") plus the immediately following story
 * (E03-S29 "File Processing Status") is the scope signal used here:
 * this is a distinct ENTRY POINT for starting a brand-new conversation
 * from an uploaded file, not a variant of E03-S008's existing
 * "attach a file to a message within an already-open conversation".
 *
 * Deliberately a NEW, additive route (`/conversations/new-file`)
 * alongside the existing `/conversations/new` (E03-S001), rather than
 * retrofitting that route's zero-interaction auto-create-and-redirect
 * behavior — `/conversations/new` has no file-selection step to plug
 * into (it fires immediately on mount, no form at all), and changing
 * that would break E03-S001/E03-S009's own already-approved, already-
 * tested behavior for a case (file-first entry) neither of those
 * stories was ever about. Two clearly-labeled links side by side on
 * the conversation list page ("開始新對話" / "上傳檔案開始對話") is
 * lower-risk than one route trying to serve both purposes, and keeps
 * this story's blast radius to purely additive changes.
 *
 * Reuses `FileAttachmentPicker` from the `[id]` route segment's
 * `_components` (E03-S008) rather than a new/duplicated picker — it
 * was already a controlled, parent-owns-the-state component with no
 * dependency on being inside a conversation, so it's directly reusable
 * here. Imported via a relative path into that sibling segment rather
 * than relocated to a shared `_components` folder — the only other
 * consumer (MessageComposer) is unaffected either way, and moving a
 * file used by an already-approved story is a bigger, riskier diff
 * than a single cross-segment import for the sake of directory-layout
 * tidiness nothing asked for.
 *
 * The "開始對話" action requires at least one file — this route's
 * whole purpose is file-first entry; a user who wants a blank
 * conversation already has "開始新對話" for that, so this page doesn't
 * duplicate that zero-file path.
 *
 * On submit: createConversation() (E03-S001's existing function,
 * unchanged) creates a blank conversation, then sendMessage(id, "",
 * fileNames) (E03-S009's existing function — already proven to accept
 * empty content with only attachments, see send-message.spec.ts's
 * "an attachment-only message (no text) can be sent") attaches the
 * selected files as the conversation's first message. If the first
 * call fails, nothing further happens. If the SECOND call fails after
 * the conversation was already created, the conversation is rolled
 * back via deleteConversation(id) (E03-S025's existing function)
 * before showing the error — Functional AC 2/5 both require that a
 * failure not leave an undefined PARTIAL side effect (a file-less
 * "ghost" conversation nobody asked to create) sitting behind an error
 * message. In practice this specific race (create succeeds, the very
 * next call against the same id fails NOT_FOUND) cannot happen through
 * this single-tab mock — but the rollback logic itself is real,
 * tested behavior implementing what the AC actually requires, not
 * speculative code for its own sake.
 *
 * Lands on the new conversation's OWN detail page (not back on the
 * list, unlike E03-S001) — the point of a file-chat entry is to arrive
 * already inside that conversation, seeing the file that was just
 * attached; sending the user back to the list would just make them
 * click in again. The AI does not auto-generate a reply the instant
 * this page redirects — MessageComposer's existing send flow (E03-S009/
 * S010) is what triggers that, unchanged, the same as for any other
 * message; inventing a new auto-stream-on-conversation-mount trigger
 * for this one entry path, with no equivalent anywhere else in this
 * codebase, would be exactly the kind of scope expansion nothing here
 * asks for. MVP 可以簡化演算法,但此能力本身(file-first entry)不可
 * 缺席 — landing in a real conversation that already shows the
 * attached file, ready to continue chatting normally, is that
 * capability; a fully autonomous first reply is not part of it.
 */
export default function FileChatEntryPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<State>({ status: "idle" });

  function handleFilesSelected(fileList: FileList) {
    setFiles((previous) => [...previous, ...Array.from(fileList)]);
  }

  function handleRemove(index: number) {
    setFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
  }

  async function handleStart() {
    if (files.length === 0 || state.status === "creating") return;

    const correlationId = crypto.randomUUID();
    const fileNames = files.map((file) => file.name);
    setState({ status: "creating" });
    logger.info("starting file-chat entry", { correlationId, fileCount: fileNames.length });
    trackEvent("file_chat_entry_attempt", { correlationId, properties: { fileCount: fileNames.length } });

    const created = await createConversation();
    if (!created.ok) {
      logger.error("failed to create conversation for file-chat entry", { correlationId, code: created.error.code });
      trackEvent("file_chat_entry_failure", { correlationId, properties: { code: created.error.code } });
      setState({ status: "error" });
      return;
    }

    const sent = await sendMessage(created.value.id, "", fileNames);
    if (!sent.ok) {
      logger.error("failed to attach files to new file-chat conversation, rolling back", {
        correlationId,
        conversationId: created.value.id,
        code: sent.error.code,
      });
      trackEvent("file_chat_entry_failure", { correlationId, properties: { code: sent.error.code } });
      await deleteConversation(created.value.id);
      setState({ status: "error" });
      return;
    }

    logger.info("file-chat conversation created", { correlationId, conversationId: created.value.id });
    trackEvent("file_chat_entry_success", { correlationId, properties: { conversationId: created.value.id } });
    router.refresh();
    router.replace(`/conversations/${created.value.id}`);
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>上傳檔案開始對話</h1>
      <FileAttachmentPicker files={files} onFilesSelected={handleFilesSelected} onRemove={handleRemove} />
      <p>
        <button type="button" onClick={handleStart} disabled={files.length === 0 || state.status === "creating"}>
          開始對話
        </button>
        {state.status === "creating" && <span role="status">建立中…</span>}
      </p>
      {state.status === "error" && <ErrorMessage message="無法建立新對話，請稍後再試。" />}
    </main>
  );
}
