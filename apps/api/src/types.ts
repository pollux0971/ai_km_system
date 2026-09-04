/**
 * Fastify type augmentation for apps/api (E04-S039).
 *
 * Declared once here so every plugin — including the ones E02-S032 /
 * E04-S040+ will add — sees the same shapes without redeclaring them.
 *
 * `retrieval` / `generation` (07-generation/phase-2, I2, ADR 0014): neither
 * `services/retrieval` nor `services/generation` declares its own `declare
 * module "fastify"` augmentation — see each package's `plugin-types.ts`
 * header, which deliberately leaves that to the host app to avoid two
 * packages' ambient declarations colliding when compiled together. Nothing
 * in `apps/api/src` typed `app.retrieval` at compile time before this
 * (06-retrieval/phase-2 only registered the plugin; nothing here read the
 * decoration back), so `./rag-plugin.ts` — the first file in this app to
 * actually call `app.retrieval.retrieve()` and `app.generation.answer()` —
 * is what first needed these two added, in their canonical place.
 */
import type { preHandlerHookHandler } from "fastify";
import type { RetrievalService } from "@ai-km/service-retrieval";
import type { GenerationService } from "@ai-km/service-generation";

/**
 * Who the caller is. Populated only by an authentication provider; a route
 * must never construct one itself.
 */
export interface AuthContext {
  /** Stable user identity. */
  readonly userId: string;
  /**
   * The key every ownership query filters on. In production this equals
   * `userId`; under `AI_KM_TEST_SANDBOX` it also carries a per-login sandbox
   * suffix (ADR 0005 §5), which is why data access must use THIS and never
   * `userId` directly.
   */
  readonly ownerKey: string;
  readonly roles: readonly string[];
  readonly sessionId: string;
}

declare module "fastify" {
  interface FastifyInstance {
    /**
     * preHandler that must guard every protected route. The default
     * implementation registered by `buildServer` denies everything (401);
     * E02-S032 replaces it with the real session lookup.
     */
    requireSession: preHandlerHookHandler;
    /** `services/retrieval`'s in-process seam — decorated by `retrievalPlugin`. */
    retrieval: RetrievalService;
    /** `services/generation`'s in-process seam — decorated by `generationPlugin`. */
    generation: GenerationService;
  }

  interface FastifyRequest {
    /** Present only after `requireSession` has run and allowed the request. */
    auth?: AuthContext;
    correlationId: string;
  }
}

export {};
