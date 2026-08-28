/**
 * Local, narrow view of what a host app must provide this domain plugin
 * (`app.requireSession`, `request.auth`) — same reasoning as
 * `services/conversation/src/plugin-types.ts`: no `declare module "fastify"`
 * ambient augmentation here, to avoid colliding with `apps/api`'s own
 * canonical one when both are compiled together.
 */
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";

/** Mirrors `AuthContext` (apps/api/src/types.ts) — the one field this domain needs. */
export interface ModelGatewayAuthContext {
  readonly userId: string;
}

export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): ModelGatewayAuthContext | undefined {
  return (request as unknown as { auth?: ModelGatewayAuthContext }).auth;
}
