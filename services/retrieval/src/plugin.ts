/**
 * `services/retrieval` domain Fastify plugin (E04-S058 scaffold, E04-S062
 * working service).
 *
 * Registers no routes yet. Its only job is to put the in-process seam where
 * siblings can reach it, per **ADR 0007 §1** (in-process is the primary path)
 * and **ADR 0007 §4** (a plugin that decorates MUST be wrapped in `fp()`).
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { createRetrievalService, type RetrievalService } from "./service.js";

export interface RetrievalPluginOptions {
  /** Injected by tests/composition roots; defaults to the real service
   * (fresh in-memory store + model-gateway-backed embedding — see
   * `service.ts`). */
  readonly service?: RetrievalService;
}

const retrievalPluginImpl: FastifyPluginAsync<RetrievalPluginOptions> = async (app, options) => {
  const service = options.service ?? createRetrievalService({});
  app.decorate("retrieval", service);
};

/**
 * Wrapped in `fastify-plugin` — **ADR 0007 §4**.
 *
 * Not wrapping it would put `app.retrieval` on a child instance, invisible to
 * every sibling, with nothing failing loudly. ADR 0007 §5 records the incident
 * that produced this rule and requires the test below to exercise a real
 * `register()` / `ready()` path rather than a handler shortcut.
 */
export const retrievalPlugin = fp(retrievalPluginImpl, { name: "ai-km-retrieval" });
