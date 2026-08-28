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
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, conversation_id, owner_key, role, content, attachment_names, state,
       revisions, feedback, feedback_reason, feedback_comment, citation_feedback, created_at, updated_at`;

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
  };
}

export interface CreateMessageInput {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly attachmentNames: string[];
  readonly state?: AnswerState;
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
    created_at: input.now,
    updated_at: input.now,
  };

  prepareOwnerScoped(
    db,
    `INSERT INTO messages
       (id, conversation_id, owner_key, role, content, attachment_names, state, created_at, updated_at)
     VALUES (@id, @conversation_id, @owner_key, @role, @content, @attachment_names, @state, @created_at, @updated_at)`,
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
