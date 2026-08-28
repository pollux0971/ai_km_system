/**
 * POST /usage-events (E13-S019 AC1, contracts/openapi/analytics.yaml).
 *
 * `additionalProperties: false` on the contract's `UsageEventInput` schema
 * already rejects a `userId` field (or any other unknown field) as a 400
 * `VALIDATION_ERROR` at the schema-validation layer, before this handler
 * ever runs — matching the contract's own top-level rule that identity
 * always comes from the session, never the request body.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { insertUsageEvent, type UsageEventName } from "../repository/usage-events.repository.js";
import { hostContracts, hostDb, hostRequireSession, requestAuth } from "../plugin-types.js";
import { FeedbackDomainError } from "../domain-error.js";

const PREFIX = "/v1";

/** Contract's own decision (analytics.yaml `UsageEventInput.occurredAt` description) — this story's implementation. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

interface UsageEventBody {
  readonly name: UsageEventName;
  readonly conversationId?: string;
  readonly answerState?: string;
  readonly citationCount?: number;
  readonly latencyMs?: number;
  readonly occurredAt: string;
}

export function registerUsageEventRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);

  app.post(
    `${PREFIX}/usage-events`,
    {
      preHandler: requireSession,
      schema: { body: hostContracts(app).getSchema("analytics", "UsageEventInput") },
    },
    async (request: FastifyRequest, reply) => {
      const auth = requestAuth(request);
      if (!auth) throw new FeedbackDomainError(401, "請先登入。");

      const body = request.body as UsageEventBody;
      const now = new Date();
      const occurredAt = new Date(body.occurredAt);
      if (occurredAt.getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) {
        throw new FeedbackDomainError(400, "事件時間不得晚於目前時間 5 分鐘以上。");
      }

      const id = randomUUID();
      insertUsageEvent(hostDb(app), {
        id,
        ownerKey: auth.ownerKey,
        userId: auth.userId,
        name: body.name,
        conversationId: body.conversationId,
        answerState: body.answerState,
        citationCount: body.citationCount,
        latencyMs: body.latencyMs,
        occurredAt: body.occurredAt,
        receivedAt: now.toISOString(),
      });

      void reply.status(201);
      return { id };
    },
  );
}
