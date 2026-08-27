/**
 * Fastify type augmentation for apps/api (E04-S039).
 *
 * Declared once here so every plugin — including the ones E02-S032 /
 * E04-S040+ will add — sees the same shapes without redeclaring them.
 */
import type { preHandlerHookHandler } from "fastify";

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
  }

  interface FastifyRequest {
    /** Present only after `requireSession` has run and allowed the request. */
    auth?: AuthContext;
    correlationId: string;
  }
}

export {};
