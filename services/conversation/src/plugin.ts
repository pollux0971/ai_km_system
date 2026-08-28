/**
 * Conversation domain Fastify plugin.
 *
 * E04-S040 registered this plugin with no routes. E04-S041 adds the
 * conversations REST surface; E04-S042 (messages), E04-S043 (feedback) and
 * E04-S044 (the change-event stream) register alongside it here.
 *
 * The `changeEventBus` decorator is created and attached HERE, before any
 * route registration below — every route file that publishes to it
 * (conversations/messages/message-feedback) reads it back via
 * `hostChangeEventBus(app)`, and the SSE route subscribes to it. One bus
 * instance per built server, matching one `apps/api` process (E04-S044:
 * cross-process fan-out is an explicit non-goal).
 *
 * `ConversationPluginOptions` exists solely so tests can shrink the SSE
 * heartbeat interval via Fastify's own per-registration options mechanism
 * (`app.register(conversationPlugin, { heartbeatIntervalMs: 20 })`) instead
 * of waiting on real 15-second timers. Production's `app.register
 * (conversationPlugin)` call passes none, so the real default always
 * applies there.
 *
 * Wrapped in `fastify-plugin`'s `fp()`: by default Fastify gives a
 * registered plugin function its OWN encapsulated child instance, so
 * `app.decorate("changeEventBus", ...)` below would only be visible to code
 * inside this plugin's own scope — invisible to anything holding the
 * PARENT `app` reference (apps/api/server.ts, and this package's own test
 * harness, which needs `changeEventBus` externally to pre-fill/inspect
 * connection state). `fp()` disables that new-context behaviour so the
 * decorator lands on the same instance the caller registered against.
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerMessageFeedbackRoutes } from "./routes/message-feedback.js";
import { registerChangeEventRoutes } from "./routes/change-events.js";
import { ChangeEventBus } from "./events/change-event-bus.js";

export interface ConversationPluginOptions {
  readonly heartbeatIntervalMs?: number;
}

const plugin: FastifyPluginAsync<ConversationPluginOptions> = async (app, opts) => {
  app.decorate("changeEventBus", new ChangeEventBus());
  registerConversationRoutes(app);
  registerMessageRoutes(app);
  registerMessageFeedbackRoutes(app);
  registerChangeEventRoutes(app, { heartbeatIntervalMs: opts.heartbeatIntervalMs });
};

export const conversationPlugin = fp(plugin, { name: "ai-km-conversation" });
