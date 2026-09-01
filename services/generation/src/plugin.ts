/**
 * `services/generation` domain Fastify plugin (E04-S059, scaffold).
 * Registers no routes. Puts the in-process seam where siblings can reach it,
 * per **ADR 0007 §1**; wrapped in `fp()` per **ADR 0007 §4**.
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { createGenerationScaffold, type GenerationService } from "./service.js";

export interface GenerationPluginOptions {
  readonly service?: GenerationService;
}

const generationPluginImpl: FastifyPluginAsync<GenerationPluginOptions> = async (app, options) => {
  app.decorate("generation", options.service ?? createGenerationScaffold());
};

/** See ADR 0007 §4/§5 — without `fp()` the decoration is invisible to siblings. */
export const generationPlugin = fp(generationPluginImpl, { name: "ai-km-generation" });
