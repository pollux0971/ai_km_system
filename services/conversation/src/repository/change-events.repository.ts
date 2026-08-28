/**
 * Change-event log repository (E04-S040, ADR 0003 §7).
 *
 * Writes the per-owner event log that E04-S044's SSE endpoint streams and
 * replays. Every mutating endpoint appends here in the SAME transaction as
 * its own write, so a client can never be told about a change that was rolled
 * back, nor miss one that committed.
 */
import type { Database } from "better-sqlite3";
import { prepareOwnerScoped, toOwnerKey, type OwnerKey } from "./owner-scope.js";

/** The five types frozen in contracts/openapi/conversations.yaml. */
export const CHANGE_EVENT_TYPES = [
  "conversation.created",
  "conversation.updated",
  "conversation.deleted",
  "message.created",
  "message.updated",
] as const;

export type ChangeEventType = (typeof CHANGE_EVENT_TYPES)[number];

export interface ChangeEventInput {
  readonly type: ChangeEventType;
  readonly conversationId: string;
  readonly messageId?: string;
  /** Untrusted echo of X-Client-Id. Never an identity. */
  readonly originClientId?: string;
  readonly occurredAt: string;
}

export interface ChangeEventRow extends ChangeEventInput {
  readonly seq: number;
}

/**
 * A replay must not let a client pull the entire log in one request. 1000 is
 * far above any real reconnect gap and far below "stream the whole table".
 */
export const MAX_CHANGE_EVENT_PAGE = 1000;

interface RawRow {
  seq: number;
  type: ChangeEventType;
  conversation_id: string;
  message_id: string | null;
  origin_client_id: string | null;
  occurred_at: string;
}

function toRow(raw: RawRow): ChangeEventRow {
  // `undefined` rather than `null` for absent values: the contract marks these
  // optional, and JSON.stringify drops undefined instead of emitting
  // `"messageId": null` on a conversation-level event.
  return {
    seq: raw.seq,
    type: raw.type,
    conversationId: raw.conversation_id,
    ...(raw.message_id === null ? {} : { messageId: raw.message_id }),
    ...(raw.origin_client_id === null ? {} : { originClientId: raw.origin_client_id }),
    occurredAt: raw.occurred_at,
  };
}

/**
 * Appends one event and returns it with its assigned `seq`.
 *
 * Must be called INSIDE the caller's transaction. `seq` is taken as
 * `MAX(seq) + 1` for this owner; that read-then-write is safe because
 * better-sqlite3 is synchronous and SQLite serialises writers, and the
 * `(owner_key, seq)` unique index turns any violation of that assumption into
 * a loud constraint error rather than two clients silently sharing an id.
 */
export function appendChangeEvent(
  db: Database,
  ownerKey: OwnerKey,
  event: ChangeEventInput,
): ChangeEventRow {
  const owner = toOwnerKey(ownerKey);

  if (!CHANGE_EVENT_TYPES.includes(event.type)) {
    throw new TypeError(
      `未知的 change event 型別 "${event.type}"。允許的值:${CHANGE_EVENT_TYPES.join(", ")}。`,
    );
  }

  const nextSeq = prepareOwnerScoped(
    db,
    "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM change_events WHERE owner_key = ?",
  ).get(owner) as { next: number };

  prepareOwnerScoped(
    db,
    `INSERT INTO change_events
       (owner_key, seq, type, conversation_id, message_id, origin_client_id, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    owner,
    nextSeq.next,
    event.type,
    event.conversationId,
    event.messageId ?? null,
    event.originClientId ?? null,
    event.occurredAt,
  );

  return { ...event, seq: nextSeq.next };
}

/**
 * Events for this owner with `seq` strictly greater than `afterSeq`, oldest
 * first — exactly the Last-Event-ID replay semantics.
 */
export function listChangeEventsAfter(
  db: Database,
  ownerKey: OwnerKey,
  afterSeq: number,
  limit: number,
): ChangeEventRow[] {
  const owner = toOwnerKey(ownerKey);
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_CHANGE_EVENT_PAGE);

  const rows = prepareOwnerScoped(
    db,
    `SELECT seq, type, conversation_id, message_id, origin_client_id, occurred_at
       FROM change_events
      WHERE owner_key = ? AND seq > ?
      ORDER BY seq ASC
      LIMIT ?`,
  ).all(owner, afterSeq, safeLimit) as RawRow[];

  return rows.map(toRow);
}

/**
 * The highest `seq` ever assigned to this owner, or 0 if none. Since `seq`
 * is a gapless per-owner counter (`MAX(seq) + 1`, E04-S040), every integer
 * from 1..latestSeq was issued to this owner at some point — so
 * `lastEventId > latestSeq` is both necessary and sufficient to detect "this
 * id was never issued to this owner" (E04-S044 AC9, `UNKNOWN_LAST_EVENT_ID`),
 * with no separate existence check needed.
 */
export function getLatestSeq(db: Database, ownerKey: OwnerKey): number {
  const owner = toOwnerKey(ownerKey);
  const row = prepareOwnerScoped(
    db,
    "SELECT COALESCE(MAX(seq), 0) AS latest FROM change_events WHERE owner_key = ?",
  ).get(owner) as { latest: number };
  return row.latest;
}
