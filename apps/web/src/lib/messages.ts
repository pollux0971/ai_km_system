import { toResult } from "@ai-km/api-client";
import type { FeedbackReason } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import type { AnswerState } from "./answer-state";
import { apiClient } from "./api";

/**
 * E03-S037: typed-client adapter over `contracts/openapi/conversations.yaml`'s message
 * endpoints (E04-S038 contract, E04-S042/S043 real implementation). Every export below
 * keeps its pre-S037 signature — `message-thread.tsx` (1306 lines) is unchanged.
 *
 * The contract's mutation endpoints (`revisions`, `feedback`, `feedback/reason`,
 * `feedback/comment`, `citations/{id}/feedback`) all need `conversationId` in their
 * path, but this file's public functions (matching message-thread.tsx's existing calls)
 * only ever receive a `messageId`. `messageCache` (messageId -> last-known Message)
 * resolves that: every function that returns a `Message` remembers it, and every
 * function that needs to construct one of those URLs looks the id up there first — a
 * miss means "this session never loaded that message" and fails closed with NOT_FOUND,
 * the same as before S037's real messageId lookups.
 */
export type AnswerFeedbackVerdict = "OK" | "NG";

export const MAX_FEEDBACK_COMMENT_LENGTH = 500;

/**
 * E01-S035: `FEEDBACK_REASONS`/`FEEDBACK_REASON_LABELS`/`FeedbackReason` moved to
 * `@ai-km/api-client` (`packages/api-client/src/feedback-reason.ts`) so `apps/admin`
 * can share the same code->label mapping instead of growing its own copy. Re-exported
 * here unchanged so every existing `@/lib/messages` importer (`message-thread.tsx`,
 * `feedback-knowledge-candidates.ts`, tests) keeps working with no call-site changes.
 */
export { FEEDBACK_REASONS, FEEDBACK_REASON_LABELS } from "@ai-km/api-client";
export type { FeedbackReason } from "@ai-km/api-client";

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  attachmentNames: string[];
  createdAt: string;
  revisions?: string[];
  state?: AnswerState;
  feedback?: AnswerFeedbackVerdict;
  feedbackReason?: FeedbackReason;
  feedbackComment?: string;
  citationFeedback?: Record<string, AnswerFeedbackVerdict>;
}

const messageCache = new Map<string, Message>();

function remember(message: Message): Message {
  messageCache.set(message.id, message);
  return message;
}

function notFound(): ApiError {
  return { code: "NOT_FOUND", message: "找不到這則訊息。" };
}

/** All messages for one conversation, oldest first — server-ordered by `createdAt` ascending. */
export async function listMessages(conversationId: string): Promise<Result<Message[], ApiError>> {
  const result = await toResult(
    apiClient.conversations.GET("/conversations/{conversationId}/messages", {
      params: { path: { conversationId } },
    }),
  );
  if (result.ok) {
    for (const message of result.value) remember(message);
  }
  return result;
}

/**
 * Sends a message. Empty content + no attachments is fail-closed client-side
 * (VALIDATION_ERROR, no request) — the server rejects it identically, but there's
 * nothing this input could ever succeed at, so no round trip is worth making. A
 * nonexistent conversationId now fails closed via the server's own 404 on this same
 * `POST .../messages` call — no separate `getConversation` pre-check needed anymore.
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  attachmentNames: string[],
): Promise<Result<Message, ApiError>> {
  if (content.length === 0 && attachmentNames.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "訊息內容不得為空。" } };
  }

  const result = await toResult(
    apiClient.conversations.POST("/conversations/{conversationId}/messages", {
      params: { path: { conversationId } },
      body: { role: "user", content, attachmentNames },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E03-S010: persists a completed assistant reply once lib/streaming.ts's mock stream
 * finishes. `state` (E03-S021) defaults to "ANSWERED" for callers that predate it.
 */
export async function receiveAssistantReply(
  conversationId: string,
  content: string,
  state: AnswerState = "ANSWERED",
): Promise<Result<Message, ApiError>> {
  const result = await toResult(
    apiClient.conversations.POST("/conversations/{conversationId}/messages", {
      params: { path: { conversationId } },
      body: { role: "assistant", content, state },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E03-S020 "Answer Revision". Resolves `messageId` -> `conversationId` via
 * `messageCache` (see file doc comment) — a miss fails closed with NOT_FOUND, same as
 * a real nonexistent id, since either way this session has no record the message
 * exists.
 */
export async function reviseMessage(
  messageId: string,
  newContent: string,
  state: AnswerState = "ANSWERED",
): Promise<Result<Message, ApiError>> {
  const cached = messageCache.get(messageId);
  if (!cached) return { ok: false, error: notFound() };

  const result = await toResult(
    apiClient.conversations.POST("/conversations/{conversationId}/messages/{messageId}/revisions", {
      params: { path: { conversationId: cached.conversationId, messageId } },
      body: { content: newContent, state },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E13-S001/S002 "Answer OK/NG feedback". Fails closed with NOT_FOUND for an unresolved
 * messageId, and VALIDATION_ERROR (client-side, no request) for a message that isn't
 * an assistant reply — same guard as before S037, kept because `messageCache` still
 * has the role available.
 */
export async function submitAnswerFeedback(
  messageId: string,
  verdict: AnswerFeedbackVerdict,
): Promise<Result<Message, ApiError>> {
  const cached = messageCache.get(messageId);
  if (!cached) return { ok: false, error: notFound() };
  if (cached.role !== "assistant") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能對 AI 回答提供回饋。" } };
  }

  const result = await toResult(
    apiClient.conversations.PUT("/conversations/{conversationId}/messages/{messageId}/feedback", {
      params: { path: { conversationId: cached.conversationId, messageId } },
      body: { verdict },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E13-S003 "feedback reason selector". Client-side fail-closed precondition (AC4): a
 * reason only ever qualifies an already-recorded NG verdict — checked here against
 * `messageCache`, so an OK-feedback message never sends a request at all.
 */
export async function submitFeedbackReason(messageId: string, reason: FeedbackReason): Promise<Result<Message, ApiError>> {
  const cached = messageCache.get(messageId);
  if (!cached) return { ok: false, error: notFound() };
  if (cached.feedback !== "NG") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能為「沒有幫助」的回饋選擇原因。" } };
  }

  const result = await toResult(
    apiClient.conversations.PUT("/conversations/{conversationId}/messages/{messageId}/feedback/reason", {
      params: { path: { conversationId: cached.conversationId, messageId } },
      body: { reason },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E13-S004 "free-text feedback". Client-side fail-closed: requires an existing verdict
 * (either OK or NG), and a trimmed, non-empty, length-bounded comment — preserved from
 * before S037, since `messageCache` still has `feedback` available to check against.
 */
export async function submitFeedbackComment(messageId: string, comment: string): Promise<Result<Message, ApiError>> {
  const cached = messageCache.get(messageId);
  if (!cached) return { ok: false, error: notFound() };
  if (cached.feedback == null) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先提供「有幫助」或「沒有幫助」的回饋。" } };
  }

  const trimmed = comment.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "留言不得為空白。" } };
  }
  if (trimmed.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: `留言長度不得超過 ${MAX_FEEDBACK_COMMENT_LENGTH} 字。` } };
  }

  const result = await toResult(
    apiClient.conversations.PUT("/conversations/{conversationId}/messages/{messageId}/feedback/comment", {
      params: { path: { conversationId: cached.conversationId, messageId } },
      body: { comment: trimmed },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * Mirrors message-content.tsx's own `CITATION_PATTERN` marker parsing
 * (`/(\[\d+\])/g`) so submitCitationFeedback below can validate that a caller-supplied
 * citationId genuinely appears in THIS message's content before accepting feedback for
 * it, client-side, before ever sending a request.
 */
const CITATION_ID_PATTERN = /\[(\d+)\]/g;

/** Exported (ux/enterprise-polish) for the conversation rail's related-content panel. */
export function extractCitationIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(CITATION_ID_PATTERN)) {
    const id = match[1];
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

/**
 * E13-S005 "citation-specific feedback". Client-side fail-closed: NOT_FOUND for an
 * unresolved messageId, VALIDATION_ERROR for a non-assistant message or a citationId
 * that doesn't appear in this message's own content (AC4's third preserved guard) —
 * all checkable against `messageCache` without a request.
 */
export async function submitCitationFeedback(
  messageId: string,
  citationId: string,
  verdict: AnswerFeedbackVerdict,
): Promise<Result<Message, ApiError>> {
  const cached = messageCache.get(messageId);
  if (!cached) return { ok: false, error: notFound() };
  if (cached.role !== "assistant") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能對 AI 回答的引用提供回饋。" } };
  }
  if (!extractCitationIds(cached.content).has(citationId)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "這則訊息沒有這個引用來源。" } };
  }

  const result = await toResult(
    apiClient.conversations.PUT("/conversations/{conversationId}/messages/{messageId}/citations/{citationId}/feedback", {
      params: { path: { conversationId: cached.conversationId, messageId, citationId } },
      body: { verdict },
    }),
  );
  if (result.ok) remember(result.value);
  return result;
}

/**
 * E03-S037: deprecated no-op. The server now deletes a conversation's messages in the
 * same transaction as the conversation itself (contracts/openapi/conversations.yaml:
 * `DELETE /conversations/{conversationId}` — "Deletes the conversation together with
 * its messages in one transaction"), so `delete-conversation.tsx` calling this no
 * longer does anything. Kept as a callable no-op (not deleted) because that `.tsx` file
 * is out of this story's Development Boundaries.
 * @deprecated Server-side cascade since E03-S037. Safe to remove once
 * delete-conversation.tsx stops calling it (a future cleanup story).
 */
export async function deleteMessagesForConversation(_conversationId: string): Promise<Result<void, ApiError>> {
  return { ok: true, value: undefined };
}
