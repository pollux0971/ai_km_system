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
 * `role` is `"user"` only — S10 (Streaming Response), S11 (Generation
 * Status), S12 (Stop Generation) are separate, still-unbuilt stories
 * that would own any assistant-reply concept; nothing in the baseline
 * states S09 must produce one, so this story only proves the user's own
 * message gets sent and reflected with correct pending/sent/failed
 * state. Adding an "assistant" role now with nothing that ever produces
 * one would be speculative, unused code.
 *
 * A persisted Message has no `status` field — every message that made
 * it into the store is definitionally sent. "pending"/"failed" are
 * transient, UI-only states that exist only in message-thread.tsx's
 * local optimistic-entry wrapper, never written here.
 *
 * `attachmentNames` stores names only, not File content — File objects
 * aren't JSON-serializable for sessionStorage, and there's nowhere real
 * to persist file content anyway (E03-S008: Frontend/BFF may never
 * connect directly to Object Storage).
 */
export interface Message {
  id: string;
  conversationId: string;
  role: "user";
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
