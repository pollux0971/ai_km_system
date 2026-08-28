/**
 * GET /admin/metrics/usage, GET /admin/metrics/latency (E13-S019 AC2/AC3,
 * contracts/openapi/analytics.yaml). Both roles lists are transcribed from
 * the contract's `x-required-roles` (informational vendor extension, not
 * itself enforcement — this route wires the actual enforcement via
 * `requireAnyRole`, E02-S033).
 */
import type { FastifyInstance } from "fastify";
import { requireAnyRole } from "@ai-km/service-identity";
import type { Role } from "@ai-km/permissions";
import { computeLatencyMetrics, computeUsageMetrics } from "../repository/usage-events.repository.js";
import { hostDb, hostRequireSession } from "../plugin-types.js";

const PREFIX = "/v1";

const METRICS_ROLES: readonly Role[] = ["it_administrator", "ai_administrator", "auditor", "super_administrator"];

/** No named contract schema exists for inline `parameters:` (same situation `conversations.yaml`'s list query has) — transcribed here. */
const USAGE_METRICS_QUERYSTRING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date"],
  properties: {
    date: { type: "string", format: "date" },
  },
} as const;

const LATENCY_METRICS_QUERYSTRING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: { type: "integer", minimum: 1, default: 7 },
  },
} as const;

export function registerAdminMetricsRoutes(app: FastifyInstance): void {
  const requireSession = hostRequireSession(app);
  const requireMetricsRole = requireAnyRole(METRICS_ROLES);

  app.get(
    `${PREFIX}/admin/metrics/usage`,
    {
      preHandler: [requireSession, requireMetricsRole],
      schema: { querystring: USAGE_METRICS_QUERYSTRING_SCHEMA },
    },
    async (request) => {
      const { date } = request.query as { date: string };
      return computeUsageMetrics(hostDb(app), date);
    },
  );

  app.get(
    `${PREFIX}/admin/metrics/latency`,
    {
      preHandler: [requireSession, requireMetricsRole],
      schema: { querystring: LATENCY_METRICS_QUERYSTRING_SCHEMA },
    },
    async (request) => {
      const { days } = request.query as { days: number };
      return computeLatencyMetrics(hostDb(app), days, new Date().toISOString());
    },
  );
}
