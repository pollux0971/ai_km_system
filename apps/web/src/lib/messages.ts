import type { ApiError, Result } from "@ai-km/types";
import type { AnswerState } from "./answer-state";
import { getConversation, touchConversationLastMessage } from "./conversations";

/**
 * E03-S009: send-message optimistic state. SOURCE_BASELINE.md gives S09
 * only its title ("E03-S09 Send Message") and no Message entity field
 * shape anywhere — the "real" future contract, E04-S002 "Message
 * entity" (Team B), is itself still an unelaborated boilerplate title
 * with no field list. Same situation as E03-S001 facing an
 * E04-Team-B-owned Conversation entity that didn't exist yet: this is a
 * Team-A-owned local mock, NOT the real contract, kept separate from
 * conversations.ts (its own file, like ai-models.ts/knowledge-scopes.ts)
 * since Message is conceptually its own collection keyed by
 * conversationId, not a field on ConversationSummary.
 *
 * `role` was `"user"` only through E03-S009 — S10 (Streaming Response)
 * is the first story with anything that produces an assistant reply,
 * so `"assistant"` is added now, not preemptively back in S009 when
 * nothing would have used it.
 *
 * A persisted Message has no `status` field — every message that made
 * it into the store is definitionally sent/received in full. Any
 * in-progress state (S09's "pending"/"failed", S10's "streaming") is
 * transient and UI-only, living only in message-thread.tsx's local
 * DisplayMessage wrapper, never written here.
 *
 * `attachmentNames` stores names only, not File content — File objects
 * aren't JSON-serializable for sessionStorage, and there's nowhere real
 * to persist file content anyway (E03-S008: Frontend/BFF may never
 * connect directly to Object Storage). Assistant replies never have
 * attachments — nothing in the spec suggests a generated reply carries
 * one, and lib/streaming.ts's mock reply is plain text only.
 *
 * `revisions` (E03-S020, "Answer Revision") is optional rather than an
 * always-present `[]`, unlike `attachmentNames` — it only starts to
 * exist once a message has actually been revised at least once via
 * reviseMessage(), so every message created by sendMessage/
 * receiveAssistantReply simply omits it (not "sets it to empty").
 * Making it required would have forced every pre-existing test fixture
 * across S009 through S019 to grow a `revisions: []` field for no
 * behavioral reason — an unrelated, purely mechanical diff this story
 * doesn't need. Holds prior *content* strings, oldest first; not full
 * Message snapshots, since nothing else about a revised reply (id,
 * conversationId, attachmentNames, createdAt) ever changes.
 *
 * `state` (E03-S021, "Answer state rendering") is optional for the same
 * reason as `revisions` — every pre-S021 fixture simply omits it, and
 * message-thread.tsx treats an absent `state` as "ANSWERED" at render
 * time (see lib/answer-state.ts for what the 6 possible values mean and
 * how a mock classifies them). User messages never have a `state` — the
 * enum classifies ANSWER quality, and only assistant replies are
 * answers.
 */
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  attachmentNames: string[];
  createdAt: string;
  revisions?: string[];
  state?: AnswerState;
}

const STORAGE_KEY = "ai-km:mock-messages";

/** Same sessionStorage-backed reasoning as conversations.ts's readStore/writeStore. */
function readStore(): Message[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

function writeStore(items: Message[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** All messages for one conversation, oldest first (insertion order). */
export async function listMessages(conversationId: string): Promise<Result<Message[], ApiError>> {
  return { ok: true, value: readStore().filter((message) => message.conversationId === conversationId) };
}

/**
 * Sends a message. Fails closed with NOT_FOUND if the conversation
 * doesn't exist — reusing getConversation's existing check rather than
 * inventing a separate "transient send failure" simulation, and giving
 * message-thread.tsx's optimistic pending→failed→retry flow a real,
 * deterministic (not random-chance) failure path to exercise: calling
 * this with a stale/nonexistent conversationId.
 *
 * On success, also updates the conversation's lastMessageAt/
 * lastMessagePreview (touchConversationLastMessage) so the
 * conversation list and Home Dashboard widget stay accurate.
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  attachmentNames: string[],
): Promise<Result<Message, ApiError>> {
  const conversation = await getConversation(conversationId);
  if (!conversation.ok) return conversation;
  if (!conversation.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } };
  }

  const message: Message = {
    id: crypto.randomUUID(),
    conversationId,
    role: "user",
    content,
    attachmentNames,
    createdAt: new Date().toISOString(),
  };
  writeStore([...readStore(), message]);

  const preview = content.length > 0 ? content : `已傳送 ${attachmentNames.length} 個附件`;
  await touchConversationLastMessage(conversationId, preview, message.createdAt);

  return { ok: true, value: message };
}

/**
 * E03-S010: persists a completed assistant reply once
 * lib/streaming.ts's mock stream finishes. A separate function from
 * sendMessage rather than a `role` parameter on it — "send" is a
 * user-initiated action; a reply "arrives"/is "received", a distinct
 * enough concept (no attachments, different actor) to warrant its own
 * name rather than overloading sendMessage's signature. Same
 * NOT_FOUND fail-closed check as sendMessage, reused rather than
 * duplicated logic — and the same deterministic (not simulated-random)
 * failure trigger message-thread.tsx's streaming→failed→retry path
 * exercises.
 *
 * `state` (E03-S021) defaults to "ANSWERED" — every call site that
 * predates S021 omits the argument entirely and keeps working
 * unchanged, matching exactly how they behaved before this story.
 */
export async function receiveAssistantReply(
  conversationId: string,
  content: string,
  state: AnswerState = "ANSWERED",
): Promise<Result<Message, ApiError>> {
  const conversation = await getConversation(conversationId);
  if (!conversation.ok) return conversation;
  if (!conversation.value) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } };
  }

  const message: Message = {
    id: crypto.randomUUID(),
    conversationId,
    role: "assistant",
    content,
    attachmentNames: [],
    createdAt: new Date().toISOString(),
    state,
  };
  writeStore([...readStore(), message]);
  await touchConversationLastMessage(conversationId, content, message.createdAt);

  return { ok: true, value: message };
}

/**
 * E03-S020 "Answer Revision". SOURCE_BASELINE's entire content for this
 * story is one line: 「需留下 Revision」— the content being replaced
 * must be *retained*, not discarded. This REPLACES S019's
 * deleteMessage-based regenerate mechanism (removed below; nothing else
 * called it) rather than extending it: delete-then-recreate-via-
 * receiveAssistantReply gives the new row a blank history — there's no
 * "previous content" left anywhere to retain once the old row is gone.
 * Updating the SAME row in place (same id, same position in the store's
 * array) makes retention trivial: push the content being overwritten
 * onto `revisions` first.
 *
 * Fails closed with NOT_FOUND, unlike deleteMessage's deliberately
 * unconditional precedent — this function actually needs the existing
 * row's current `content`/`revisions` to build the update, so the
 * lookup isn't optional plumbing here, it's required by what the
 * function does.
 *
 * `state` (E03-S021) also defaults to "ANSWERED", same reasoning as
 * receiveAssistantReply — but message-thread.tsx's only caller
 * (handleRegenerate, via runStream) always passes the ORIGINAL
 * message's own state explicitly rather than relying on this default,
 * since a regeneration answers the same underlying question and the
 * mock's classification of that question hasn't changed. The default
 * here exists only for direct/test callers that don't care about state.
 */
export async function reviseMessage(messageId: string, newContent: string, state: AnswerState = "ANSWERED"): Promise<Result<Message, ApiError>> {
  const messages = readStore();
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } };
  }

  const revised: Message = {
    ...existing,
    content: newContent,
    revisions: [...(existing.revisions ?? []), existing.content],
    state,
  };
  writeStore(messages.map((message) => (message.id === messageId ? revised : message)));
  await touchConversationLastMessage(existing.conversationId, newContent, new Date().toISOString());

  return { ok: true, value: revised };
}

/**
 * E03-S025 "Delete conversation confirmation". Cascade-cleanup for
 * lib/conversations.ts's deleteConversation() — called by the SAME
 * caller (DeleteConversation, the UI component), not by
 * deleteConversation() itself, since conversations.ts has no existing
 * precedent of reaching into this module's store (messages.ts already
 * calls INTO conversations.ts's touchConversationLastMessage; the
 * reverse direction doesn't exist anywhere in this codebase, and
 * introducing it here for the first time would tangle these two
 * intentionally-separate collections — see messages.ts's own top-of-
 * file doc comment on why Message is kept apart from
 * ConversationSummary in the first place).
 *
 * Deliberately unconditional (no NOT_FOUND check) — same reasoning the
 * original S019 deleteMessage() gave for its own unconditional design:
 * this is a cleanup step for messages whose parent conversation is
 * already confirmed gone (the caller only reaches this after
 * deleteConversation() itself already succeeded), not a user-facing
 * mutation with its own existence contract to enforce. A conversation
 * with zero messages (never sent anything) is a completely normal,
 * expected case, not an error.
 */
export async function deleteMessagesForConversation(conversationId: string): Promise<Result<void, ApiError>> {
  writeStore(readStore().filter((message) => message.conversationId !== conversationId));
  return { ok: true, value: undefined };
}
