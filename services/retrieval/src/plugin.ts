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
import type { VectorStore } from "./vector/store.js";

export interface RetrievalPluginOptions {
  /**
   * Injected by tests/composition roots; defaults to the real service
   * (fresh in-memory store + model-gateway-backed embedding — see
   * `service.ts`).
   *
   * E06-S026: a caller supplying its own `service` OWNS
   * `enforceEmbeddingVersion` entirely — this plugin does not, and cannot,
   * inspect or override a `RetrievalService` it did not build. This plugin's
   * OWN default construction line (below) turns the check on; a caller that
   * builds its own `RetrievalService` via `createRetrievalService(...)` and
   * hands it in here is responsible for deciding that value itself, the same
   * as `plugin.test.ts`'s AC-RS3/AC-RS4 and every other test in this package
   * that constructs its own service already does. Do not assume this plugin
   * guarantees the protection is on for an injected `service`.
   */
  readonly service?: RetrievalService;
  /**
   * E06-S026 — TEST-ONLY seam. Ignored whenever `service` is supplied. Lets a
   * test seed the store the plugin's OWN default composition line
   * constructs, without hand-building a whole `RetrievalService` (which
   * would bypass this file's default line entirely, the way `plugin.test.ts`'s
   * AC-RS3 already does on purpose). Not meant for a real composition root —
   * a real caller either supplies `service` or takes the bare default.
   */
  readonly store?: VectorStore;
}

const retrievalPluginImpl: FastifyPluginAsync<RetrievalPluginOptions> = async (app, options) => {
  // E06-S026 — the real composition root turns the embedding-version check
  // ON. A caller with a store this story's ingestion pipeline actually wrote
  // to always carries embedding identity; an unmigrated/legacy store
  // correctly gets refused (`EmbeddingVersionMismatchError`) rather than
  // silently ranking by a mismatched model. This default does not disturb
  // any existing test: every PRE-EXISTING test file in this package that
  // exercises `retrieve()` against real data constructs its OWN
  // `RetrievalService` via `createRetrievalService({ store, embedding })` and
  // passes it in as `options.service` (see `plugin.test.ts`'s AC-RS3,
  // `service.test.ts`, `rerank/retrieve-with-reranking.test.ts`), bypassing
  // this default entirely; `plugin.test.ts`'s AC-RS2 reaches this exact line
  // but against a fresh, empty store, where the version check has nothing to
  // iterate and never fires either way.
  //
  // `enforceEmbeddingVersion: true` HAS to be pinned by something that
  // actually exercises this exact call — reviewer finding, 2026-09-02: an
  // earlier version of this story shipped this line with zero test coverage
  // on it; deleting the flag left `pnpm --filter @ai-km/service-retrieval
  // test` at 81/81, unchanged. `plugin.test.ts`'s AC-RS5 (added for that
  // finding) registers this plugin with ONLY `options.store` set — i.e. via
  // THIS default line, not a hand-built `service` — seeded with an
  // identity-less record, and asserts the real registered instance refuses
  // to retrieve it. `options.store` exists on `RetrievalPluginOptions`
  // for exactly that purpose; see its doc comment.
  const service =
    options.service ??
    createRetrievalService({
      enforceEmbeddingVersion: true,
      ...(options.store ? { store: options.store } : {}),
    });
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
