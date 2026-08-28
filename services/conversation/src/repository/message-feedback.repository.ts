/**
 * Message feedback repository (E04-S043, contracts/openapi/conversations.yaml).
 *
 * Callers must have already resolved the target message to `role:
 * "assistant"` via `getMessage` (messages.repository.ts) before calling any
 * function here — same division of responsibility as `createRevision`:
 * business-rule preconditions (verdict already NG, comment non-empty, the
 * citation actually appears in content) live in the route layer, this file
 * only re-scopes the write.
 */
import type { Database } from "better-sqlite3";
import { prepareOwnerScoped, toOwnerKey, type OwnerKey } from "./owner-scope.js";
import {
  getMessageByOwner,
  type AnswerFeedbackVerdict,
  type FeedbackReason,
  type MessageRow,
} from "./messages.repository.js";

function mustReselect(db: Database, owner: OwnerKey, messageId: string): MessageRow {
  const row = getMessageByOwner(db, owner, messageId);
  if (!row) {
    throw new Error(`訊息 "${messageId}" 在寫入後找不到了 — 呼叫端必須先確認訊息存在。`);
  }
  return row;
}

/**
 * Mirrors `apps/web/src/lib/messages.ts`'s `CITATION_ID_PATTERN`/
 * `extractCitationIds` (E13-S005) — copied, not imported, since
 * `services/conversation` cannot depend on `apps/web`. Kept pattern-
 * identical so server-side validation accepts exactly the markers the
 * frontend's own renderer recognises.
 */
const CITATION_ID_PATTERN = /\[(\d+)\]/g;

export function extractCitationIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const match of content.matchAll(CITATION_ID_PATTERN)) {
    const id = match[1];
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

export function setFeedbackVerdict(
  db: Database,
  ownerKey: OwnerKey,
  messageId: string,
  verdict: AnswerFeedbackVerdict,
  now: string,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  prepareOwnerScoped(
    db,
    `UPDATE messages SET feedback = @verdict, updated_at = @now WHERE id = @id AND owner_key = @owner_key`,
  ).run({ id: messageId, owner_key: owner, verdict, now });
  return mustReselect(db, owner, messageId);
}

export function setFeedbackReason(
  db: Database,
  ownerKey: OwnerKey,
  messageId: string,
  reason: FeedbackReason,
  now: string,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  prepareOwnerScoped(
    db,
    `UPDATE messages SET feedback_reason = @reason, updated_at = @now WHERE id = @id AND owner_key = @owner_key`,
  ).run({ id: messageId, owner_key: owner, reason, now });
  return mustReselect(db, owner, messageId);
}

export function setFeedbackComment(
  db: Database,
  ownerKey: OwnerKey,
  messageId: string,
  comment: string,
  now: string,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  prepareOwnerScoped(
    db,
    `UPDATE messages SET feedback_comment = @comment, updated_at = @now WHERE id = @id AND owner_key = @owner_key`,
  ).run({ id: messageId, owner_key: owner, comment, now });
  return mustReselect(db, owner, messageId);
}

export function setCitationFeedback(
  db: Database,
  ownerKey: OwnerKey,
  messageId: string,
  citationId: string,
  verdict: AnswerFeedbackVerdict,
  now: string,
): MessageRow {
  const owner = toOwnerKey(ownerKey);
  const current = mustReselect(db, owner, messageId);
  const merged = { ...(current.citationFeedback ?? {}), [citationId]: verdict };

  prepareOwnerScoped(
    db,
    `UPDATE messages SET citation_feedback = @citation_feedback, updated_at = @now WHERE id = @id AND owner_key = @owner_key`,
  ).run({ id: messageId, owner_key: owner, citation_feedback: JSON.stringify(merged), now });

  return mustReselect(db, owner, messageId);
}
