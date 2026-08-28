/**
 * GET /admin/feedback, GET /admin/feedback/{messageId} (E13-S019 AC4-AC6,
 * contracts/openapi/analytics.yaml). The cross-owner read model itself
 * (`adminListMessagesWithFeedback`/`adminGetMessage`) lives in
 * `@ai-km/service-conversation` (that domain owns the `messages` table);
 * this route file is the ONLY place in the repo allowed to call them
 * (Security AC — enforced by `admin-read-callers.test.ts`'s grep test, not
 * by anything in this file), and only ever after `requireAnyRole` has run.
 *
 * `GET /admin/feedback/{messageId}` deliberately has NO body/param schema
 * validation for `messageId`'s shape: the contract documents only
 * 401/403/404/500 for this operation, no 400 — a malformed or non-existent
 * id both resolve to the same 404 via `adminGetMessage` returning
 * `undefined`, rather than inventing an undocumented 400.
 */
import type { FastifyInstance } from "fastify";
import { requireAnyRole } from "@ai-km/service-identity";
import type { Role } from "@ai-km/permissions";
import {
  adminGetMessage,
  adminListMessagesWithFeedback,
  type AdminFeedbackVerdict,
} from "@ai-km/service-conversation";
import { hostDb, hostRequireSession } from "../plugin-types.js";
import { FeedbackDomainError } from "../domain-error.js";

const PREFIX = "/v1";

const FEEDBACK_ROLES: readonly Role[] = ["auditor", "ai_administrator", "super_administrator"];

const LIST_FEEDBACK_QUERYSTRING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["ok", "ng"] },
    hasReason: { type: "boolean" },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 200, default: 20 },
  },
} as const;

export function registerAdminFeedbackRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);
  const requireFeedbackRole = requireAnyRole(FEEDBACK_ROLES);

  app.get(
    `${PREFIX}/admin/feedback`,
    {
      preHandler: [requireSession, requireFeedbackRole],
      schema: { querystring: LIST_FEEDBACK_QUERYSTRING_SCHEMA },
    },
    async (request) => {
      const { verdict, hasReason, page, pageSize } = request.query as {
        verdict?: AdminFeedbackVerdict;
        hasReason?: boolean;
        page: number;
        pageSize: number;
      };
      return adminListMessagesWithFeedback(hostDb(app), { verdict, hasReason, page, pageSize });
    },
  );

  app.get(
    `${PREFIX}/admin/feedback/:messageId`,
    { preHandler: [requireSession, requireFeedbackRole] },
    async (request) => {
      const { messageId } = request.params as { messageId: string };
      const item = adminGetMessage(hostDb(app), messageId);
      if (!item) throw new FeedbackDomainError(404, "找不到指定的回饋紀錄。");
      return item;
    },
  );
}
