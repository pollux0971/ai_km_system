/**
 * Local, narrow view of what a host app must provide this domain plugin.
 * Same reasoning as `services/retrieval/src/plugin-types.ts` and
 * `services/conversation/src/plugin-types.ts`: no `declare module "fastify"`
 * ambient augmentation here, so this package cannot collide with `apps/api`'s
 * own canonical one when both are compiled together.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

/** Mirrors `AuthContext` (apps/api/src/types.ts) — the one field this domain needs. */
export interface IngestionAuthContext {
  readonly userId: string;
}

/**
 * Reads `app.requireSession` FRESH on every request rather than snapshotting it
 * at route-registration time. E04-S051's defect was the snapshot: registration
 * order changed underneath it and every authenticated request started failing.
 */
export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return async function requireSessionProxy(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const current = (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
    await (current as (req: FastifyRequest, rep: FastifyReply) => Promise<void> | void)(request, reply);
  };
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): IngestionAuthContext | undefined {
  return (request as unknown as { auth?: IngestionAuthContext }).auth;
}

/** The contract names `apps/api` has loaded. See model-gateway's equivalent. */
export function hostSpecNames(app: FastifyInstance): readonly string[] {
  const contracts = (app as unknown as { contracts?: { specNames?: () => string[] } }).contracts;
  if (!contracts || typeof contracts.specNames !== "function") return [];
  try {
    return contracts.specNames();
  } catch {
    return [];
  }
}
