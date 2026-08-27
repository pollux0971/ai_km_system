/**
 * Conversation domain Fastify plugin (E04-S040 skeleton).
 *
 * Routes land here in E04-S041 (conversations REST), E04-S042 (messages),
 * E04-S043 (feedback) and E04-S044 (the change-event stream). This story
 * registers the plugin and nothing else, so those four can be developed
 * against a mount point that already exists.
 *
 * Deliberately empty rather than absent: an empty registered plugin is
 * visible in `apps/api/src/server.ts` and in the route table, whereas a
 * missing one would have to be discovered.
 */
import type { FastifyPluginAsync } from "fastify";

export const conversationPlugin: FastifyPluginAsync = async (app) => {
  app.log.debug("conversation domain plugin registered (no routes yet — E04-S041+)");
};
