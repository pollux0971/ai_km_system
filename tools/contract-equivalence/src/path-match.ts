/**
 * Path/method matching between a live Fastify route and an OpenAPI
 * operation.
 *
 * NORMALISATION RULE 1 — path templates: Fastify spells a path parameter
 * `:conversationId`; OpenAPI spells the same thing `{conversationId}`.
 * Converting one into the other's syntax (rather than, say, stripping both
 * down to a wildcard) is safe because it is a pure lexical rewrite — the
 * parameter NAME is preserved, so a route whose param is misnamed relative
 * to the contract (e.g. `:msgId` for the contract's `{messageId}`) still
 * fails to match and shows up as a real ABSENT-both-ways pair, not a false
 * MATCH. What this could hide: nothing structural — it only equates two
 * spellings of the identical parameter position.
 *
 * NORMALISATION RULE 2 — the `/v1` prefix: every contract's `servers:` is
 * `- url: /v1`, but that prefix is baked into each route's own literal
 * (`` `${PREFIX}/conversations` ``) rather than applied via a Fastify
 * plugin `prefix:` option. Stripping a leading `/v1` before comparing is
 * the direct encoding of `servers.url`, not a guess.
 */

/** `:id` -> `{id}`. Leaves an already-`{id}`-style path untouched (idempotent). */
export function fastifyPathToOpenApiPath(fastifyUrl: string): string {
  return fastifyUrl.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** Strips exactly one leading `/v1` segment, matching every contract's `servers: [{url: /v1}]`. */
export function stripApiPrefix(url: string): string {
  return url.replace(/^\/v1(?=\/|$)/, "") || "/";
}

export interface RouteKey {
  readonly path: string; // OpenAPI-style, `/v1` stripped
  readonly method: string; // lowercase
}

export function routeKeyOf(fastifyUrl: string, method: string): RouteKey {
  return {
    path: fastifyPathToOpenApiPath(stripApiPrefix(fastifyUrl)),
    method: method.toLowerCase(),
  };
}

export function routeKeyToString(key: RouteKey): string {
  return `${key.method.toUpperCase()} ${key.path === "" ? "/" : key.path}`;
}
