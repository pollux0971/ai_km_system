/**
 * Local, narrow view of what a host app must provide a domain plugin
 * (`apps/api/README.md` §"Available decorators": `app.db`, `app.requireSession`,
 * `app.contracts`, `request.auth`).
 *
 * Deliberately NOT a `declare module "fastify"` ambient augmentation here.
 * `@ai-km/service-conversation`'s `package.json` points `main`/`types` at
 * this package's own TypeScript SOURCE, so when `apps/api` imports
 * `conversationPlugin`, `apps/api`'s own `tsc` run type-checks these `.ts`
 * files directly rather than a prebuilt `.d.ts`. `apps/api/src/types.ts`
 * and `apps/api/src/contracts.ts` already declare the real, canonical
 * ambient augmentations for `request.auth` (`AuthContext`) and
 * `app.contracts` (`ContractRegistry`). A second, differently-named
 * augmentation for the same Fastify property declared here would collide
 * with those the moment both are compiled together ("subsequent property
 * declarations must have the same type"). Reading through a narrow local
 * cast avoids that entirely while still reaching the real runtime
 * decorator — `services/conversation` and `apps/api` each type-check
 * independently, and neither needs to import the other's types to agree on
 * the untyped JSON shape actually on the wire.
 */
import type { Database } from "better-sqlite3";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";

/** Mirrors `ContractRegistry.getSchema` (apps/api/src/contracts.ts) — the one method this domain needs. */
export interface ConversationContractSource {
  getSchema(specName: string, schemaName: string): Record<string, unknown>;
}

/** Mirrors `AuthContext` (apps/api/src/types.ts) — the one field this domain needs. */
export interface ConversationAuthContext {
  readonly ownerKey: string;
}

export function hostDb(app: FastifyInstance): Database {
  return (app as unknown as { db: Database }).db;
}

export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
}

export function hostContracts(app: FastifyInstance): ConversationContractSource {
  return (app as unknown as { contracts: ConversationContractSource }).contracts;
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): ConversationAuthContext | undefined {
  return (request as unknown as { auth?: ConversationAuthContext }).auth;
}
