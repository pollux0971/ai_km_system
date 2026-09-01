/**
 * `services/ingestion` domain Fastify plugin (E06-S041, scaffold).
 * Registers no routes. Wrapped in `fp()` per **ADR 0007 §4**.
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { createIngestionScaffold, type IngestionService } from "./service.js";

export interface IngestionPluginOptions {
  readonly service?: IngestionService;
}

const ingestionPluginImpl: FastifyPluginAsync<IngestionPluginOptions> = async (app, options) => {
  app.decorate("ingestion", options.service ?? createIngestionScaffold());
};

/** See ADR 0007 §4/§5. */
export const ingestionPlugin = fp(ingestionPluginImpl, { name: "ai-km-ingestion" });
