/**
 * usage_events repository (E13-S019, contracts/openapi/analytics.yaml).
 *
 * `db/migrations/202608280003_analytics.sql` deliberately does not CHECK
 * `name` against the contract's current 3-value whitelist — the contract,
 * not this table's schema, is this repo's single source of truth for that
 * list, so a future contract-approved 4th value never needs a migration.
 */
import type { Database } from "better-sqlite3";

export type UsageEventName = "conversation_message_sent" | "conversation_created" | "rag_answer_outcome";

export interface InsertUsageEventInput {
  readonly id: string;
  readonly ownerKey: string;
  /** Real underlying account id — distinct from ownerKey under AI_KM_TEST_SANDBOX (see migration's comment). */
  readonly userId: string;
  readonly name: UsageEventName;
  readonly conversationId?: string;
  readonly answerState?: string;
  readonly citationCount?: number;
  readonly latencyMs?: number;
  readonly occurredAt: string;
  readonly receivedAt: string;
}

export function insertUsageEvent(db: Database, input: InsertUsageEventInput): void {
  db.prepare(
    `INSERT INTO usage_events
       (id, owner_key, user_id, name, conversation_id, answer_state, citation_count, latency_ms, occurred_at, received_at)
     VALUES (@id, @owner_key, @user_id, @name, @conversation_id, @answer_state, @citation_count, @latency_ms, @occurred_at, @received_at)`,
  ).run({
    id: input.id,
    owner_key: input.ownerKey,
    user_id: input.userId,
    name: input.name,
    conversation_id: input.conversationId ?? null,
    answer_state: input.answerState ?? null,
    citation_count: input.citationCount ?? null,
    latency_ms: input.latencyMs ?? null,
    occurred_at: input.occurredAt,
    received_at: input.receivedAt,
  });
}

export interface UsageMetrics {
  readonly date: string;
  readonly dailyActiveUsers: number;
  readonly questionsAsked: number;
}

/**
 * `dailyActiveUsers` — distinct `user_id` (not `owner_key`, see the
 * migration's comment) with at least one usage event, of ANY name, on
 * `date`'s UTC calendar day. `questionsAsked` counts `conversation_
 * message_sent` events over the ENTIRE table, not scoped to `date` — this
 * is an explicit technical decision (E13-S019 spec, aligning with E13-S012's
 * own client-side `computeQuestionsAsked` semantics), not an oversight:
 * `date` only ever affects DAU.
 */
export function computeUsageMetrics(db: Database, date: string): UsageMetrics {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const dailyActiveUsers = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS count FROM usage_events WHERE occurred_at >= @dayStart AND occurred_at <= @dayEnd`,
      )
      .get({ dayStart, dayEnd }) as { count: number }
  ).count;

  const questionsAsked = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM usage_events WHERE name = 'conversation_message_sent'`)
      .get() as { count: number }
  ).count;

  return { date, dailyActiveUsers, questionsAsked };
}

export interface LatencyMetrics {
  readonly averageLatencyMs: number | null;
  readonly sampleCount: number;
}

/** SQL `AVG()` over zero rows is `NULL` — this already IS "null, never 0" (contract's own required distinction) without any extra branching. */
export function computeLatencyMetrics(db: Database, days: number, now: string): LatencyMetrics {
  const windowStart = new Date(new Date(now).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const row = db
    .prepare(
      `SELECT AVG(latency_ms) AS avg, COUNT(latency_ms) AS count FROM usage_events
       WHERE name = 'rag_answer_outcome' AND latency_ms IS NOT NULL AND occurred_at >= @windowStart`,
    )
    .get({ windowStart }) as { avg: number | null; count: number };

  return { averageLatencyMs: row.avg, sampleCount: row.count };
}
