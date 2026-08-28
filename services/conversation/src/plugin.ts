/**
 * Conversation domain Fastify plugin.
 *
 * E04-S040 registered this plugin with no routes. E04-S041 adds the
 * conversations REST surface; E04-S042 (messages), E04-S043 (feedback) and
 * E04-S044 (the change-event stream) register alongside it here.
 */
import type { FastifyPluginAsync } from "fastify";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerMessageFeedbackRoutes } from "./routes/message-feedback.js";

export const conversationPlugin: FastifyPluginAsync = async (app) => {
  registerConversationRoutes(app);
  registerMessageRoutes(app);
  registerMessageFeedbackRoutes(app);
};
