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
  // E06-S026 — the real composition root turns the embedding-version check
  // ON. A caller with a store this story's ingestion pipeline actually wrote
  // to always carries embedding identity; an unmigrated/legacy store
  // correctly gets refused (`EmbeddingVersionMismatchError`) rather than
  // silently ranking by a mismatched model. This default does not disturb
  // any existing test: every test file in this package that exercises
  // `retrieve()` against real data constructs its OWN `RetrievalService` via
  // `createRetrievalService({ store, embedding })` and passes it in as
  // `options.service` (see `plugin.test.ts`'s AC-RS3, `service.test.ts`,
  // `rerank/retrieve-with-reranking.test.ts`), bypassing this default
  // entirely; the only test that reaches this exact line (`plugin.test.ts`'s
  // AC-RS2) does so against a fresh, empty store, where the version check's
  // loop has nothing to iterate and never fires either way.
  const service = options.service ?? createRetrievalService({ enforceEmbeddingVersion: true });
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
