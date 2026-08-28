/**
 * Cross-owner admin read model (E13-S019, contracts/openapi/analytics.yaml
 * `FeedbackItem`/`FeedbackQueuePage`).
 *
 * Every query here is DELIBERATELY not owner-scoped — that is the entire
 * point of an admin feedback queue, which by definition surfaces feedback
 * the caller did not submit. `prepareOwnerScoped` would reject a statement
 * with no `owner_key` predicate outright (by design, for every OTHER query
 * in this package), so these two functions use a raw `db.prepare()` instead,
 * matching the one other place this package already does that deliberately
 * (`lookupConversation` — see its own comment). The names carry an `admin`
 * prefix specifically so a caller cannot reach for these by accident: they
 * must only ever be invoked after a role gate has already run (Security AC
 * — enforced by `admin-read-callers.test.ts`'s grep regression test, not by
 * anything in this file).
 *
 * A message has AT MOST one feedback record — `verdict`/`reason`/`comment`/
 * `citationFeedback` are single-valued columns on the message row itself
 * (E04-S043), not a separate feedback table with its own id. `FeedbackItem
 * .id` is therefore the messageId: there is no second id space to invent,
 * and the contract's `id` field being distinct from `messageId` in its own
 * example is just that — an example, not a requirement that they differ.
 */
import type { Database } from "better-sqlite3";
import type { AnswerFeedbackVerdict, FeedbackReason } from "./messages.repository.js";

/** Lowercase — `apps/admin`'s own shape (analytics.yaml `FeedbackVerdict`), NOT conversations.yaml's uppercase `OK`/`NG`. */
export type AdminFeedbackVerdict = "ok" | "ng";

export interface AdminFeedbackCitationVerdict {
  readonly citationId: string;
  readonly verdict: AdminFeedbackVerdict;
}

export interface AdminFeedbackItem {
  readonly id: string;
  readonly verdict: AdminFeedbackVerdict;
  readonly reason?: FeedbackReason;
  readonly comment?: string;
  readonly citationFeedback?: readonly AdminFeedbackCitationVerdict[];
  /** The message row's `updated_at` — the closest available signal to "when feedback was submitted"; there is no dedicated feedback-submission timestamp column (see file header). */
  readonly submittedAt: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly answerExcerpt: string;
}

export interface AdminFeedbackPage {
  readonly items: readonly AdminFeedbackItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface AdminListFeedbackOptions {
  readonly verdict?: AdminFeedbackVerdict;
  readonly hasReason?: boolean;
  readonly page: number;
  readonly pageSize: number;
}

interface RawFeedbackRow {
  id: string;
  conversation_id: string;
  content: string;
  feedback: AnswerFeedbackVerdict;
  feedback_reason: FeedbackReason | null;
  feedback_comment: string | null;
  citation_feedback: string | null;
  updated_at: string;
}

const ANSWER_EXCERPT_MAX_LENGTH = 200;

function toAdminFeedbackVerdict(verdict: AnswerFeedbackVerdict): AdminFeedbackVerdict {
  return verdict === "OK" ? "ok" : "ng";
}

/** Stable order: citation markers in message content are always `[<digits>]`, so a numeric sort is a meaningful order, not an arbitrary one. */
function toCitationFeedbackArray(
  raw: string | null,
): readonly AdminFeedbackCitationVerdict[] | undefined {
  if (raw === null) return undefined;
  const parsed = JSON.parse(raw) as Record<string, AnswerFeedbackVerdict>;
  return Object.entries(parsed)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([citationId, verdict]) => ({ citationId, verdict: toAdminFeedbackVerdict(verdict) }));
}

function toAdminFeedbackItem(raw: RawFeedbackRow): AdminFeedbackItem {
  return {
    id: raw.id,
    verdict: toAdminFeedbackVerdict(raw.feedback),
    ...(raw.feedback_reason === null ? {} : { reason: raw.feedback_reason }),
    ...(raw.feedback_comment === null ? {} : { comment: raw.feedback_comment }),
    ...(toCitationFeedbackArray(raw.citation_feedback) === undefined
      ? {}
      : { citationFeedback: toCitationFeedbackArray(raw.citation_feedback) }),
    submittedAt: raw.updated_at,
    messageId: raw.id,
    conversationId: raw.conversation_id,
    answerExcerpt: raw.content.slice(0, ANSWER_EXCERPT_MAX_LENGTH),
  };
}

const SELECT_COLUMNS = `id, conversation_id, content, feedback, feedback_reason, feedback_comment, citation_feedback, updated_at`;

/**
 * Newest-submitted first (`updated_at DESC`) — the only ordering that makes
 * "page 1" mean "what an admin most likely wants to triage first" rather
 * than an arbitrary insertion order.
 */
export function adminListMessagesWithFeedback(
  db: Database,
  options: AdminListFeedbackOptions,
): AdminFeedbackPage {
  const conditions = ["feedback IS NOT NULL"];
  const params: Record<string, unknown> = {};

  if (options.verdict !== undefined) {
    conditions.push("feedback = @feedback");
    params.feedback = options.verdict === "ok" ? "OK" : "NG";
  }
  if (options.hasReason !== undefined) {
    conditions.push(options.hasReason ? "feedback_reason IS NOT NULL" : "feedback_reason IS NULL");
  }

  const whereClause = conditions.join(" AND ");
  const totalCount = (
    db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE ${whereClause}`).get(params) as {
      count: number;
    }
  ).count;

  const offset = (options.page - 1) * options.pageSize;
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM messages WHERE ${whereClause}
       ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: options.pageSize, offset }) as RawFeedbackRow[];

  return {
    items: rows.map(toAdminFeedbackItem),
    page: options.page,
    pageSize: options.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / options.pageSize)),
  };
}

/** `undefined` for both "no such message" and "message exists but has no feedback" — the route maps either to 404, matching the contract's NotFound description. */
export function adminGetMessage(db: Database, messageId: string): AdminFeedbackItem | undefined {
  const raw = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM messages WHERE id = @id AND feedback IS NOT NULL`)
    .get({ id: messageId }) as RawFeedbackRow | undefined;
  return raw ? toAdminFeedbackItem(raw) : undefined;
}
