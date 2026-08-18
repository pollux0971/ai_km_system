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
 *
 * `feedback` (E13-S001 "Answer OK feedback") is optional for the same
 * reason as `revisions`/`state` — every pre-S001 fixture simply omits
 * it, and message-thread.tsx treats an absent `feedback` as "not yet
 * given" at render time. Like `state`, only assistant replies are ever
 * given feedback — a user's own message isn't an "answer" to react to.
 *
 * `"NG"` (E13-S002 "Answer NG feedback") widens the union to its full,
 * final shape — SOURCE_BASELINE's golden flow "...→ OK / NG → Feedback
 * Loop" names both as the only two verdicts, so unlike `state` (which
 * has kept growing across multiple stories), there is no third value to
 * anticipate here. `submitAnswerFeedback` itself needed zero logic
 * changes for this: it already took `verdict: AnswerFeedbackVerdict`
 * generically and does a plain upsert regardless of value, so widening
 * the type is the entire lib-level change.
 *
 * `feedbackReason` (E13-S003 "feedback reason selector") is a SEPARATE
 * optional field from `feedback`, not folded into a combined verdict —
 * neither SOURCE_BASELINE nor the E13 epic file gives this story any
 * content beyond its title (confirmed: the epic section for E13-S003 is
 * the same generic boilerplate every E13 story shares, with zero
 * story-specific fields/options named anywhere in
 * AI_KM_BMAD_High_Granularity/). `FEEDBACK_REASONS`'s 4 options below are
 * therefore a Team-A ASSUMPTION (documented in EVIDENCE), the smallest
 * set directly inferable from the story title itself, not an invented
 * contract — this is UI copy, not an endpoint/schema/permission the Anti-
 * hallucination Guard would forbid guessing. Kept as its own field
 * (rather than widening `feedback` to `"OK" | "NG" | "NG:INCORRECT" | ...`)
 * because a reason only ever qualifies an already-given NG verdict; it is
 * never itself a verdict, and folding it in would force every OK-feedback
 * fixture to reason about a dimension that never applies to it.
 *
 * `feedbackComment` (E13-S004 "free-text feedback") is a THIRD separate
 * optional field, alongside `feedback`/`feedbackReason` rather than folded
 * into either — same "epic file gives this story nothing beyond its
 * title" situation S003 already documented (confirmed again by grep), so
 * every design choice below is a Team-A ASSUMPTION, not a spec fact.
 * Unlike `feedbackReason` (which submitFeedbackReason gates on
 * `feedback === "NG"` specifically, since a *reason* only makes sense for
 * a negative verdict), this field is gated on `feedback != null` — EITHER
 * verdict, not NG-only. A free-text comment is a general "anything else
 * you want to add" elaboration on whatever verdict was already given
 * (SOURCE_BASELINE's golden flow names only "Feedback Loop" generically,
 * with no verdict-specific carve-out), not specifically an explanation of
 * *why NG* the way the structured reason selector is — an OK comment like
 * "this was especially helpful because..." is just as coherent as an NG
 * one, so narrowing this to NG-only the way S003 narrowed reason would be
 * an unjustified extra restriction this story's title doesn't ask for.
 * `MAX_FEEDBACK_COMMENT_LENGTH` (500) is likewise a Team-A ASSUMPTION —
 * some bound is a hard requirement (Security Acceptance: "所有外部輸入均做
 * schema validation"), but no length appears anywhere in
 * AI_KM_BMAD_High_Granularity/; 500 is picked as a generous-but-bounded
 * free-text size for a supplementary comment, not a full document.
 *
 * `citationFeedback` (E13-S005 "citation-specific feedback") is again a
 * Team-A ASSUMPTION on shape — same "epic file gives this story nothing
 * beyond its title" situation as S003/S004 (confirmed by grep). Unlike
 * S001-S004's whole-answer feedback (one verdict per message),
 * "citation-specific" by its own name targets an individual `[N]`
 * citation marker within a message's content (see message-content.tsx's
 * CITATION_PATTERN), of which a single assistant reply can contain
 * several distinct ones — so this is a map keyed by citationId, not a
 * single field, mirroring how `MOCK_CITATION_SOURCES` in lib/citations.ts
 * is itself keyed by citation id. Reuses `AnswerFeedbackVerdict` ("OK" |
 * "NG") rather than inventing a parallel citation-specific verdict type —
 * "was this specific source helpful/accurate" is the same OK/NG shape as
 * "was this whole answer helpful", just scoped narrower.
 */
export type AnswerFeedbackVerdict = "OK" | "NG";

export const MAX_FEEDBACK_COMMENT_LENGTH = 500;

export const FEEDBACK_REASONS = ["INCORRECT", "INCOMPLETE", "OFF_TOPIC", "OTHER"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  INCORRECT: "答案不正確",
  INCOMPLETE: "答案不完整",
  OFF_TOPIC: "答案離題",
  OTHER: "其他",
};

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
 * E13-S001 "Answer OK feedback" / E13-S002 "Answer NG feedback" share this
 * one function — `verdict` was always generic over `AnswerFeedbackVerdict`,
 * so S002 needed zero changes here beyond the type widening on that alias.
 * Fails closed with NOT_FOUND for a nonexistent messageId (same "real,
 * deterministic failure path" reason sendMessage/receiveAssistantReply/
 * reviseMessage already give) and with VALIDATION_ERROR for a message that
 * exists but isn't an assistant reply — feedback reacts to an ANSWER, and
 * a user's own message was never one; this keeps the check fail-closed
 * rather than silently accepting or silently no-op-ing on a target the
 * caller never should have been able to construct through the real UI in
 * the first place (message-thread.tsx only ever renders the feedback
 * controls on `role === "assistant"` entries).
 *
 * Idempotent by construction: this simply upserts the `feedback` field
 * on the existing row (same update-in-place shape as reviseMessage),
 * never appends a new record, so submitting the same verdict twice for
 * the same message produces the identical persisted state, not a
 * duplicate side effect (Functional AC 5). It also allows switching
 * verdicts (OK→NG or NG→OK) at the data layer — message-thread.tsx's UI
 * is what enforces "no undo once given" (both buttons become disabled
 * once either verdict is recorded), the same trust boundary already
 * established by S001 for its own single button; this function has no
 * additional guard against being called with a different verdict than
 * whatever is already stored, matching S001's plain-upsert precedent.
 */
export async function submitAnswerFeedback(messageId: string, verdict: AnswerFeedbackVerdict): Promise<Result<Message, ApiError>> {
  const messages = readStore();
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } };
  }
  if (existing.role !== "assistant") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能對 AI 回答提供回饋。" } };
  }

  const updated: Message = { ...existing, feedback: verdict };
  writeStore(messages.map((message) => (message.id === messageId ? updated : message)));

  return { ok: true, value: updated };
}

/**
 * E13-S003 "feedback reason selector". A reason only ever qualifies an
 * NG verdict that has already been recorded via submitAnswerFeedback —
 * this function fails closed with VALIDATION_ERROR (Functional AC 2:
 * "缺少必要輸入...不產生部分 side effect") for a message whose current
 * `feedback` isn't `"NG"`, covering both "no feedback given yet" and
 * "OK was given" in one check, rather than only checking `feedback ==
 * null` and silently letting an OK-feedback message grow a reason that
 * message-thread.tsx's UI would never let a real user reach in the
 * first place (mirrors submitAnswerFeedback's own "role !== assistant"
 * fail-closed check for the same "caller shouldn't have been able to
 * construct this through the real UI" reasoning).
 *
 * Same idempotent-upsert shape as submitAnswerFeedback/reviseMessage:
 * updates the row in place, allows switching to a different reason
 * (data-layer has no additional guard against it — same trust boundary
 * S001/S002 already established, message-thread.tsx's UI is what
 * enforces "no changing the reason once submitted").
 */
export async function submitFeedbackReason(messageId: string, reason: FeedbackReason): Promise<Result<Message, ApiError>> {
  const messages = readStore();
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } };
  }
  if (existing.feedback !== "NG") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能為「沒有幫助」的回饋選擇原因。" } };
  }

  const updated: Message = { ...existing, feedbackReason: reason };
  writeStore(messages.map((message) => (message.id === messageId ? updated : message)));

  return { ok: true, value: updated };
}

/**
 * E13-S004 "free-text feedback". Requires SOME feedback verdict to already
 * exist (`feedback != null` — either OK or NG, see this file's field-doc
 * comment above for why this is broader than submitFeedbackReason's
 * NG-only gate), fails closed with VALIDATION_ERROR otherwise (Functional
 * AC 2/3: no side effect without a legitimate prior verdict to attach to).
 * Also fails closed with VALIDATION_ERROR for an empty/whitespace-only
 * comment or one exceeding MAX_FEEDBACK_COMMENT_LENGTH after trimming —
 * Security Acceptance's "所有外部輸入均做 schema validation" is a hard
 * requirement even though no concrete length is spec'd (see field-doc
 * comment). Stores the TRIMMED comment, not the raw input, so a comment
 * that is only whitespace after trimming is correctly rejected as empty
 * rather than persisted as meaningless padding.
 *
 * Same idempotent-upsert shape as submitAnswerFeedback/submitFeedbackReason:
 * updates the row in place, allows re-submitting a revised comment (data
 * layer has no additional guard — message-thread.tsx's UI is what would
 * enforce any "no editing once submitted" policy, same trust boundary
 * S001/S002/S003 already established).
 */
export async function submitFeedbackComment(messageId: string, comment: string): Promise<Result<Message, ApiError>> {
  const messages = readStore();
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } };
  }
  if (existing.feedback == null) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請先提供「有幫助」或「沒有幫助」的回饋。" } };
  }

  const trimmed = comment.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "留言不得為空白。" } };
  }
  if (trimmed.length > MAX_FEEDBACK_COMMENT_LENGTH) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: `留言長度不得超過 ${MAX_FEEDBACK_COMMENT_LENGTH} 字。` } };
  }

  const updated: Message = { ...existing, feedbackComment: trimmed };
  writeStore(messages.map((message) => (message.id === messageId ? updated : message)));

  return { ok: true, value: updated };
}

/**
 * Mirrors message-content.tsx's own `CITATION_PATTERN` marker parsing
 * (`/(\[\d+\])/g`) so submitCitationFeedback below can validate that a
 * caller-supplied citationId genuinely appears in THIS message's content
 * before accepting feedback for it — Security Acceptance's "所有外部輸入均
 * 做 schema validation" applied to citationId specifically, rather than
 * trusting any string the caller passes. Kept as an independent regex
 * here (not imported from message-content.tsx, a "use client" component)
 * rather than shared — this lib module has no existing precedent of
 * importing FROM a component file, and the two use cases (render vs.
 * validate) don't need to share code, just stay pattern-consistent.
 */
const CITATION_ID_PATTERN = /\[(\d+)\]/g;

function extractCitationIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(CITATION_ID_PATTERN)) {
    const id = match[1];
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

/**
 * E13-S005 "citation-specific feedback". Fails closed with NOT_FOUND for
 * a nonexistent messageId and VALIDATION_ERROR for a non-assistant
 * message, mirroring submitAnswerFeedback's own checks (a user's own
 * message was never an "answer" with citations to react to). Additionally
 * fails closed with VALIDATION_ERROR when citationId isn't one of the
 * `[N]` markers actually present in this message's own content — without
 * this check, a caller could record feedback against a citation id that
 * was never shown to the user for this message at all, which would be
 * accepting an externally-supplied id with no real corresponding UI
 * affordance to have produced it.
 *
 * Same idempotent-upsert shape as submitAnswerFeedback/submitFeedbackReason/
 * submitFeedbackComment: updates (merges into) the `citationFeedback`
 * record in place, so submitting the same verdict for the same
 * (messageId, citationId) pair twice produces identical persisted state
 * (Functional AC 5), and is scoped to ONLY the targeted citationId within
 * the record — feedback on one citation never touches another citation's
 * entry in the same message's `citationFeedback` map. Allows switching
 * verdicts at the data layer (no additional guard), same trust boundary
 * S001-S004 already established: message-thread.tsx's UI is what enforces
 * "no undo once given".
 */
export async function submitCitationFeedback(
  messageId: string,
  citationId: string,
  verdict: AnswerFeedbackVerdict,
): Promise<Result<Message, ApiError>> {
  const messages = readStore();
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } };
  }
  if (existing.role !== "assistant") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "只能對 AI 回答的引用提供回饋。" } };
  }
  if (!extractCitationIds(existing.content).has(citationId)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "這則訊息沒有這個引用來源。" } };
  }

  const updated: Message = { ...existing, citationFeedback: { ...(existing.citationFeedback ?? {}), [citationId]: verdict } };
  writeStore(messages.map((message) => (message.id === messageId ? updated : message)));

  return { ok: true, value: updated };
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
