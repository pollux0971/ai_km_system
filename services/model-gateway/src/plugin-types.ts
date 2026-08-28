/**
 * Local, narrow view of what a host app must provide this domain plugin
 * (`app.requireSession`, `request.auth`) — same reasoning as
 * `services/conversation/src/plugin-types.ts`: no `declare module "fastify"`
 * ambient augmentation here, to avoid colliding with `apps/api`'s own
 * canonical one when both are compiled together.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

/** Mirrors `AuthContext` (apps/api/src/types.ts) — the one field this domain needs. */
export interface ModelGatewayAuthContext {
  readonly userId: string;
}

/**
 * E04-S051: returns a preHandler that reads `app.requireSession` FRESH on
 * every request rather than snapshotting it once at route-registration
 * time. See `services/conversation/src/plugin-types.ts`'s equivalent for
 * the full incident writeup — this package's own registration currently
 * happens AFTER `identityPlugin` reassigns `app.requireSession`, so this
 * was not actually broken, but the snapshot pattern itself is fragile: it
 * silently breaks again the moment registration order changes. Depth
 * defence, not a live bug fix, for this package.
 */
export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return async function requireSessionProxy(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const current = (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
    await (current as (req: FastifyRequest, rep: FastifyReply) => Promise<void> | void)(request, reply);
  };
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): ModelGatewayAuthContext | undefined {
  return (request as unknown as { auth?: ModelGatewayAuthContext }).auth;
}
