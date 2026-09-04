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
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { ChangeEventBus } from "./events/change-event-bus.js";

/** Mirrors `ContractRegistry.getSchema` (apps/api/src/contracts.ts) — the one method this domain needs. */
export interface ConversationContractSource {
  getSchema(specName: string, schemaName: string): Record<string, unknown>;
}

/** Mirrors `AuthContext` (apps/api/src/types.ts) — the fields this domain needs. */
export interface ConversationAuthContext {
  readonly ownerKey: string;
  /**
   * Added for 03-conversation/phase-2 (I2, ADR 0014's "移除條件"): the one
   * thing this route can hand `app.rag.ask()` as the asker's own identity
   * (see `hostRag` below). Real `AuthContext` (apps/api/src/types.ts) and
   * the bare `buildTestApp()` harness (`testing/build-test-app.ts`) both
   * already set this field on `request.auth` — nothing upstream changes to
   * add it here.
   */
  readonly userId: string;
}

export function hostDb(app: FastifyInstance): Database {
  return (app as unknown as { db: Database }).db;
}

/**
 * E04-S051: returns a preHandler that reads `app.requireSession`
 * FRESH on every request, not a snapshot taken once at route-registration
 * time.
 *
 * The bug this fixes: `hostRequireSession(app)` used to just return
 * `app.requireSession`'s value at the moment it was called. Routes call it
 * once, during their own registration inside `conversationPlugin`, and
 * store the result in a local `const`. `apps/api/src/server.ts` registers
 * `conversationPlugin` BEFORE `identityPlugin`, and `identityPlugin`
 * REASSIGNS `app.requireSession = composeRequireSession(...)` — a plain
 * property write, which (correctly, per ordinary JS semantics) does
 * nothing to a variable that already copied the OLD function reference.
 * Every conversation-domain route was therefore permanently pinned to
 * whatever `requireSession` existed before `identityPlugin` ran: the
 * `apps/api/src/auth-decorator.ts` stub, which denies every request when
 * the test auth provider is off — i.e. always, in production. A real,
 * valid session cookie never reached the check that would have accepted
 * it.
 *
 * Returning a thin proxy that reads `app.requireSession` again on every
 * call — rather than the value itself — makes correctness independent of
 * registration order: whichever plugin decorates/reassigns it last before
 * the first real request is served is the one every route actually runs.
 */
export function hostRequireSession(app: FastifyInstance): preHandlerHookHandler {
  return async function requireSessionProxy(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const current = (app as unknown as { requireSession: preHandlerHookHandler }).requireSession;
    await (current as (req: FastifyRequest, rep: FastifyReply) => Promise<void> | void)(request, reply);
  };
}

export function hostContracts(app: FastifyInstance): ConversationContractSource {
  return (app as unknown as { contracts: ConversationContractSource }).contracts;
}

/**
 * `changeEventBus` (E04-S044) is decorated by `conversationPlugin` itself,
 * not by the host app — unlike `db`/`requireSession`/`contracts`, there is
 * no cross-package ambient-augmentation risk here at all. Kept as a narrow
 * cast anyway, purely for consistency with the rest of this file.
 */
export function hostChangeEventBus(app: FastifyInstance): ChangeEventBus {
  return (app as unknown as { changeEventBus: ChangeEventBus }).changeEventBus;
}

/** Present only after `requireSession` has run and allowed the request. */
export function requestAuth(request: FastifyRequest): ConversationAuthContext | undefined {
  return (request as unknown as { auth?: ConversationAuthContext }).auth;
}

/**
 * Narrow, local mirror of `apps/api/src/rag-plugin.ts`'s `RagCaller` and
 * `Citation` (`@ai-km/service-model-gateway`'s `generation/provider.ts`).
 * Same reasoning as `ConversationContractSource`/`ConversationAuthContext`
 * above: this package cannot import `apps/api` (ADR 0014 — the fixed I2
 * scope, and the direction of dependency it lives behind, stay in `apps/
 * api`'s composition root, never in `services/*`), so it reads `app.rag`
 * back through a structural cast rather than importing `RagSeam`.
 */
export interface ConversationRagCaller {
  readonly principalId: string;
}

export interface ConversationRagCitation {
  readonly chunkId: string;
  readonly documentId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ConversationRagAnswer {
  readonly answer: string;
  readonly citations: readonly ConversationRagCitation[];
}

export interface ConversationRagSeam {
  ask(question: string, caller: ConversationRagCaller): Promise<ConversationRagAnswer>;
}

/**
 * `app.rag` only exists on the real `apps/api` `buildServer()` instance
 * (`ragPlugin`, registered after `retrievalPlugin`/`generationPlugin`) — the
 * bare `buildTestApp()` harness this package's own vitest suite uses
 * (`testing/build-test-app.ts`) never registers it. Returning `undefined`
 * rather than throwing lets a route ask "is RAG wired up here?" and skip
 * triggering it when it is not — which is exactly what keeps every phase-1
 * vitest test (and phase-1's own cucumber scenarios) byte-for-byte
 * unchanged: they exercise `POST .../messages` through the bare harness,
 * where `hostRag(app)` is always `undefined` and no RAG call is ever made.
 */
export function hostRag(app: FastifyInstance): ConversationRagSeam | undefined {
  return (app as unknown as { rag?: ConversationRagSeam }).rag;
}
