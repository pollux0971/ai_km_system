/**
 * Local, narrow view of what a host app must provide a domain plugin —
 * same pattern and same rationale as `services/conversation/src/
 * plugin-types.ts` (deliberately NOT a `declare module "fastify"` ambient
 * augmentation here, to avoid colliding with apps/api's own canonical
 * declarations when apps/api's own tsc compiles this package's raw
 * TypeScript source directly).
 *
 * The side-effect import below is unrelated to that narrow-cast pattern:
 * `@ai-km/service-identity`'s OWN production code (`require-session.ts`,
 * `plugin.ts`) uses `request.cookies`/`reply.setCookie`/`reply.clearCookie`
 * — properties `@fastify/cookie`'s own ambient `declare module "fastify"`
 * adds — without importing that package itself (only identity's OWN test
 * files do, which is why identity's own standalone typecheck accidentally
 * works, and why apps/api's typecheck works — apps/api's server.ts imports
 * `@fastify/cookie` directly). This package imports `requireAnyRole` from
 * identity's production code without going through either of those, so its
 * OWN typecheck needs to load that same ambient augmentation itself.
 */
import "@fastify/cookie";
import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

export interface FeedbackContractSource {
  getSchema(specName: string, schemaName: string): Record<string, unknown>;
}

export interface FeedbackAuthContext {
  readonly userId: string;
  readonly ownerKey: string;
  readonly roles: readonly string[];
}

export function hostDb(app: FastifyInstance): Database {
  return (app as unknown as { db: Database }).db;
}

/** Same live-read rationale as `services/conversation`'s `hostRequireSession` (E04-S051) — reads `app.requireSession` fresh on every request, not a snapshot from registration time. */
export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return async function requireSessionProxy(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const current = (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
    await (current as (req: FastifyRequest, rep: FastifyReply) => Promise<void> | void)(request, reply);
  };
}

export function hostContracts(app: FastifyInstance): FeedbackContractSource {
  return (app as unknown as { contracts: FeedbackContractSource }).contracts;
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): FeedbackAuthContext | undefined {
  return (request as unknown as { auth?: FeedbackAuthContext }).auth;
}
