/**
 * Collects every route Fastify actually registers, via the `onRoute`
 * application hook (not a per-request hook — it fires once, synchronously,
 * the instant `app.get/post/put/patch/delete(...)` runs).
 *
 * WHY THIS MUST ATTACH BEFORE `buildServer()` REGISTERS ANY DOMAIN PLUGIN:
 * `onRoute` only fires for routes registered AFTER the hook exists in that
 * part of the encapsulation tree. `apps/api/src/server.ts`'s own
 * `BuildServerOptions.testExtraPlugin` is registered LAST — after
 * `identityPlugin`, `conversationPlugin`, `feedbackPlugin` and
 * `modelGatewayPlugin` have already finished registering every route this
 * story cares about — so attaching the collector there would silently
 * observe nothing. Instead, `check.live.test.ts` uses `vi.mock("fastify",
 * ...)` to wrap the `Fastify(...)` factory itself: `attachRouteCollector`
 * runs the instant the instance is constructed, before `server.ts` calls
 * `.register(...)` on it even once, and `onRoute` hooks added at the root
 * are inherited by every child plugin registered afterwards (Fastify's own
 * documented behaviour — `onRoute` is one of the few hooks that is NOT
 * encapsulated). This attaches to the real Fastify instance `buildServer()`
 * itself creates; nothing about `apps/api` is modified.
 */
import type { FastifyInstance, RouteOptions } from "fastify";

export interface CollectedRouteSchema {
  readonly body?: unknown;
  readonly querystring?: unknown;
  readonly params?: unknown;
  readonly headers?: unknown;
  readonly response?: Record<string, unknown>;
}

export interface CollectedRoute {
  readonly method: string; // e.g. "GET" — always upper-case
  /** Fastify's own path syntax, e.g. "/v1/conversations/:conversationId". */
  readonly url: string;
  readonly schema?: CollectedRouteSchema;
}

export function attachRouteCollector(app: FastifyInstance, sink: CollectedRoute[]): void {
  app.addHook("onRoute", (routeOptions: RouteOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    for (const method of methods) {
      sink.push({
        method: String(method).toUpperCase(),
        url: routeOptions.url,
        schema: routeOptions.schema as CollectedRouteSchema | undefined,
      });
    }
  });
}

/**
 * Routes this tool deliberately never reports on:
 *   - `HEAD`/`OPTIONS`: Fastify auto-adds a `HEAD` sibling for every `GET`
 *     route (`exposeHeadRoutes`, on by default) carrying the identical
 *     schema — reporting it too would double every GET finding for zero
 *     new information. No contract in this repo declares a HEAD or OPTIONS
 *     operation either, so keeping them would only ever show up as
 *     permanent, uninformative "route with no yaml operation" noise.
 *   - `/v1/__test__/*`: `server.ts`'s own test-only routes, gated on the
 *     fixture-only "sample" spec being loaded — never true when this tool
 *     runs against the real `contracts/openapi` dir, but filtered
 *     defensively in case that ever changes.
 */
export function isReportableRoute(route: CollectedRoute): boolean {
  if (route.method === "HEAD" || route.method === "OPTIONS") return false;
  if (route.url.startsWith("/v1/__test__/")) return false;
  return true;
}
