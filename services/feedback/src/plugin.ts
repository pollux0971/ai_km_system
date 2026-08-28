import type { FastifyPluginAsync } from "fastify";
import { registerUsageEventRoutes } from "./routes/usage-events.js";
import { registerAdminMetricsRoutes } from "./routes/admin-metrics.js";
import { registerAdminFeedbackRoutes } from "./routes/admin-feedback.js";

export const feedbackPlugin: FastifyPluginAsync = async (app) => {
  registerUsageEventRoutes(app);
  registerAdminMetricsRoutes(app);
  registerAdminFeedbackRoutes(app);
};
