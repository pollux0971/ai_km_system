/**
 * Fastify type augmentation, scoped to this package's own compilation unit.
 *
 * This mirrors (does not import) apps/api/src/types.ts's `AuthContext` /
 * `requireSession` / `request.auth` shapes. services/identity is compiled as
 * an independent TypeScript project (own tsconfig, own `pnpm typecheck`) and
 * must never depend on apps/api — that dependency runs the other way, apps/api
 * depends on this package — so the shape is repeated here rather than
 * imported. TypeScript's structural typing means this still lines up with
 * apps/api's own augmentation of the SAME `fastify` module at the real
 * server's compile time; only the declaration is duplicated, not the runtime
 * behaviour.
 */
import type { preHandlerHookHandler } from "fastify";
import type { Database } from "better-sqlite3";

export interface AuthContext {
  readonly userId: string;
  readonly ownerKey: string;
  readonly roles: readonly string[];
  readonly sessionId: string;
}

declare module "fastify" {
  interface FastifyInstance {
    requireSession: preHandlerHookHandler;
    /** Decorated by apps/api/src/db/plugin.ts (E04-S040), registered before this plugin. */
    db: Database;
  }

  interface FastifyRequest {
    auth?: AuthContext;
  }
}
