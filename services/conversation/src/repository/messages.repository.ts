/**
 * Messages repository (E04-S042, contracts/openapi/conversations.yaml).
 *
 * `updated_at` exists on the `messages` table (E04-S040 schema) but is
 * deliberately NEVER exposed in `MessageRow` — the contract's `Message`
 * schema has no `updatedAt` property at all (`additionalProperties: false`),
 * unlike `Conversation`, which does. It stays internal bookkeeping only.
 */
import type { Database } from "better-sqlite3";
import { prepareOwnerScoped, toOwnerKey, type OwnerKey } from "./owner-scope.js";

export type MessageRole = "user" | "assistant";
export type AnswerState =
  | "ANSWERED"
  | "PARTIAL"
  | "NO_EVIDENCE"
  | "ERROR"
  | "PERMISSION_DENIED"
  | "SOURCE_UNAVAILABLE";
export type AnswerFeedbackVerdict = "OK" | "NG";
export type FeedbackReason = "INCORRECT" | "INCOMPLETE" | "OFF_TOPIC" | "OTHER";

/**
 * Mirrors `contracts/openapi/generation.yaml`'s `Citation` verbatim (ADR
 * 0016 D1 — `conversations.yaml`'s `Message.citations` items `$ref` that
 * same schema so the two can never drift). Defined locally rather than
 * imported from `@ai-km/service-generation`/`@ai-km/service-model-gateway`:
 * this repository has no reason to depend on either package, and the shape
 * is four primitive fields that are cheap to mirror.
 */
export interface MessageCitation {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface MessageRow {
  readonly id: string;
  readonly conversationId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly attachmentNames: string[];
  readonly createdAt: string;
  readonly state?: AnswerState;
  readonly revisions?: string[];
  readonly feedback?: AnswerFeedbackVerdict;
  readonly feedbackReason?: FeedbackReason;
  readonly feedbackComment?: string;
  readonly citationFeedback?: Record<string, AnswerFeedbackVerdict>;
  /**
   * ADR 0016 D3 — absent (this key does not exist on the object at all) means
   * this message was never produced by the RAG path; `[]` means the RAG path
   * ran and found nothing to cite. `toMessage()` below only adds this key
   * when the underlying column is non-NULL, so the two stay distinguishable
   * all the way out to the JSON response (a `citations: undefined` property
   * would already be dropped by `JSON.stringify`, but the row itself must
   * not paper over the distinction earlier by defaulting to `[]`).
   */
  readonly citations?: MessageCitation[];
}

interface RawMessageRow {
  id: string;
  conversation_id: string;
  owner_key: string;
  role: MessageRole;
  content: string;
  attachment_names: string;
  state: AnswerState | null;
  revisions: string | null;
  feedback: AnswerFeedbackVerdict | null;
  feedback_reason: FeedbackReason | null;
  feedback_comment: string | null;
  citation_feedback: string | null;
  citations: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Unconditional — every `messages` table this repository is ever handed has
 * `citations` (`db/migrations/202609050001_conversation_message_citations.sql`,
 * 03-conversation/phase-2, ADR 0016). An earlier revision of this file
 * detected the column at runtime (`PRAGMA table_info`) because
 * `messages.repository.test.ts`'s hand-rolled `create table messages` DDL
 * predated it — that detection was withdrawn (technical-advisor review):
 * silently omitting `citations` when a deployment's migration has not run
 * is exactly GHERKIN_WORKFLOW §5.1's "靜默給出錯誤結果" (a message comes back
 * looking fine, just missing citations, and nothing errors) — the same
 * failure mode this domain is graded **嚴格級** over. The test file's schema
 * was fixed instead (see its own history), which is the correct fix for a
 * schema drift, not a runtime fallback in production code.
 */
const SELECT_COLUMNS = `id, conversation_id, owner_key, role, content, attachment_names, state,
       revisions, feedback, feedback_reason, feedback_comment, citation_feedback, citations, created_at, updated_at`;

function toMessage(raw: RawMessageRow): MessageRow {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    role: raw.role,
    content: raw.content,
    attachmentNames: JSON.parse(raw.attachment_names) as string[],
    createdAt: raw.created_at,
    ...(raw.state === null ? {} : { state: raw.state }),
    ...(raw.revisions === null ? {} : { revisions: JSON.parse(raw.revisions) as string[] }),
    ...(raw.feedback === null ? {} : { feedback: raw.feedback }),
    ...(raw.feedback_reason === null ? {} : { feedbackReason: raw.feedback_reason }),
    ...(raw.feedback_comment === null ? {} : { feedbackComment: raw.feedback_comment }),
    ...(raw.citation_feedback === null
      ? {}
      : { citationFeedback: JSON.parse(raw.citation_feedback) as Record<string, AnswerFeedbackVerdict> }),
    ...(raw.citations === null ? {} : { citations: JSON.parse(raw.citations) as MessageCitation[] }),
  };
}

export interface CreateMessageInput {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly attachmentNames: string[];
  readonly state?: AnswerState;
  /**
   * Omit entirely for a message that never went through the RAG path (the
   * asker's own question, or any pre-I2 message) — that is what keeps the
   * column NULL and the response field absent (ADR 0016 D3). Pass `[]`
   * explicitly for a RAG-path answer that found nothing to cite.
   */
  readonly citations?: readonly MessageCitation[];
  readonly now: string;
}

export function createMessage(
  db: Database,
  ownerKey: OwnerKey,
  conversationId: string,
  input: CreateMessageInput,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  const raw: RawMessageRow = {
    id: input.id,
    conversation_id: conversationId,
    owner_key: owner,
    role: input.role,
    content: input.content,
    attachment_names: JSON.stringify(input.attachmentNames),
    state: input.state ?? null,
    revisions: null,
    feedback: null,
    feedback_reason: null,
    feedback_comment: null,
    citation_feedback: null,
    citations: input.citations === undefined ? null : JSON.stringify(input.citations),
    created_at: input.now,
    updated_at: input.now,
  };

  prepareOwnerScoped(
    db,
    `INSERT INTO messages
       (id, conversation_id, owner_key, role, content, attachment_names, state, citations, created_at, updated_at)
     VALUES (@id, @conversation_id, @owner_key, @role, @content, @attachment_names, @state, @citations, @created_at, @updated_at)`,
  ).run(raw);

  return toMessage(raw);
}

/** All of a conversation's messages, oldest first — not paginated (contract, out of scope by design). */
export function listMessages(db: Database, ownerKey: OwnerKey, conversationId: string): MessageRow[] {
  const owner = toOwnerKey(ownerKey);
  const rows = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM messages
      WHERE conversation_id = ? AND owner_key = ?
      ORDER BY created_at ASC`,
  ).all(conversationId, owner) as RawMessageRow[];
  return rows.map(toMessage);
}

/**
 * A single message, scoped to BOTH owner and conversation — the contract's
 * `messageId` parameter is documented as "Must belong to conversationId;
 * otherwise 404", so a message that exists under a different conversation
 * (even one this owner owns) must not be found here.
 */
export function getMessage(
  db: Database,
  ownerKey: OwnerKey,
  conversationId: string,
  messageId: string,
): MessageRow | undefined {
  const owner = toOwnerKey(ownerKey);
  const raw = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM messages
      WHERE id = ? AND conversation_id = ? AND owner_key = ?`,
  ).get(messageId, conversationId, owner) as RawMessageRow | undefined;
  return raw ? toMessage(raw) : undefined;
}

/**
 * Re-reads a message by owner + id only (no conversation scoping) — used by
 * `message-feedback.repository.ts` (E04-S043) to re-select a row immediately
 * after one of its own owner-scoped writes, where the conversation id isn't
 * threaded through. Never used to decide 403/404 — `getMessage` (via its
 * caller's prior conversation-ownership check) already establishes that
 * before any feedback write happens.
 */
export function getMessageByOwner(db: Database, ownerKey: OwnerKey, messageId: string): MessageRow | undefined {
  const owner = toOwnerKey(ownerKey);
  const raw = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM messages WHERE id = ? AND owner_key = ?`,
  ).get(messageId, owner) as RawMessageRow | undefined;
  return raw ? toMessage(raw) : undefined;
}

/**
 * Updates the parent conversation's summary fields after a message is
 * created — the "連動摘要" half of AC2/AC3. Callers must have already
 * confirmed ownership (this story never calls it without a preceding
 * `lookupConversation` "found").
 */
export function touchConversationSummary(
  db: Database,
  ownerKey: OwnerKey,
  conversationId: string,
  preview: string,
  now: string,
): void {
  const owner = toOwnerKey(ownerKey);
  prepareOwnerScoped(
    db,
    `UPDATE conversations
        SET last_message_at = @now, last_message_preview = @preview, updated_at = @now
      WHERE id = @id AND owner_key = @owner_key`,
  ).run({ id: conversationId, owner_key: owner, preview, now });
}

/**
 * Replaces an assistant message's content, pushing the old value onto
 * `revisions` (oldest first). Callers must have already confirmed the
 * target message exists, belongs to this conversation/owner, and has
 * `role: "assistant"` (a 400 VALIDATION_ERROR business rule, not something
 * this repository function re-checks).
 */
export function createRevision(
  db: Database,
  ownerKey: OwnerKey,
  messageId: string,
  newContent: string,
  state: AnswerState | undefined,
  now: string,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  const current = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM messages WHERE id = ? AND owner_key = ?`,
  ).get(messageId, owner) as RawMessageRow;

  const revisions = [...(current.revisions === null ? [] : (JSON.parse(current.revisions) as string[])), current.content];

  prepareOwnerScoped(
    db,
    `UPDATE messages
        SET content = @content, revisions = @revisions, state = COALESCE(@state, state), updated_at = @now
      WHERE id = @id AND owner_key = @owner_key`,
  ).run({
    id: messageId,
    owner_key: owner,
    content: newContent,
    revisions: JSON.stringify(revisions),
    state: state ?? null,
    now,
  });

  const raw = prepareOwnerScoped(
    db,
    `SELECT ${SELECT_COLUMNS} FROM messages WHERE id = ? AND owner_key = ?`,
  ).get(messageId, owner) as RawMessageRow;
  return toMessage(raw);
}
