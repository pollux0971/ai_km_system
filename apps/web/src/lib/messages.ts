import type { ApiError, Result } from "@ai-km/types";
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
 */
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  attachmentNames: string[];
  createdAt: string;
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
 */
export async function receiveAssistantReply(conversationId: string, content: string): Promise<Result<Message, ApiError>> {
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
  };
  writeStore([...readStore(), message]);
  await touchConversationLastMessage(conversationId, content, message.createdAt);

  return { ok: true, value: message };
}

/**
 * E03-S019: "Regenerate answer action". message-thread.tsx calls this
 * before starting a fresh stream to replace an already-settled
 * assistant reply — without it, regenerating would leave the old
 * message behind in the store while a new one gets added via
 * receiveAssistantReply, so a reload would show BOTH the discarded and
 * the regenerated reply instead of just the one the user actually
 * wanted (a real duplicate-side-effect bug, not just a display quirk —
 * directly the kind of thing Functional AC 5, "重複請求/重試不得造成
 * 未定義重複 side effect", is about).
 *
 * Deliberately unconditional (no NOT_FOUND/conversation-existence
 * check like sendMessage/receiveAssistantReply have) — unlike those,
 * this is never called with an unverified id from outside; its only
 * caller passes the id of a message message-thread.tsx is already
 * rendering on screen, so the conversation it belongs to is
 * definitionally loaded. Scoped by message id alone (ids are globally
 * unique via crypto.randomUUID()), not conversationId, since there's
 * nothing meaningful to additionally validate.
 */
export async function deleteMessage(messageId: string): Promise<Result<void, ApiError>> {
  writeStore(readStore().filter((message) => message.id !== messageId));
  return { ok: true, value: undefined };
}
