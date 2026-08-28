/**
 * `requireSession` (E02-S032, overrides the E04-S039 seam in
 * apps/api/src/auth-decorator.ts).
 *
 * `composeRequireSession` layers the real cookie-based check in FRONT of
 * whatever `apps/api` had already decorated `requireSession` with, rather
 * than replacing it outright:
 *
 *  - a request carrying the `ai_km_session` cookie always gets the real
 *    check — this is the whole point of the story;
 *  - a request with NO cookie falls through to the previous handler, which
 *    is either E04-S039's deny-everything stub, or (only when
 *    `enableTestAuthProvider` is on) its `x-test-user` fake-identity path.
 *
 * The fallback exists so `apps/api/src/server.test.ts` — a file this story
 * is not allowed to touch — keeps passing unmodified: its
 * "requireSession (AC8 / security-negative)" suite asserts exactly that
 * `x-test-user`-without-a-cookie behaviour, and it was already
 * approved/merged under E04-S039. Composing over it, instead of replacing
 * it, is what makes both stories' contracts true at once.
 */
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Database } from "better-sqlite3";
import type { Role } from "@ai-km/permissions";
import { hashSessionToken } from "./crypto.js";
import { deleteSessionById, findSessionWithUserByTokenHash, touchSession } from "./repository.js";
import type { AuthContext } from "./fastify-types.js";

export const SESSION_COOKIE_NAME = "ai_km_session";
export const SESSION_IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * HTTPS per AC1: `x-forwarded-proto: https` (behind a reverse proxy) OR a
 * direct TLS socket. Checked explicitly rather than via Fastify's
 * `trustProxy`/`request.protocol`, which apps/api does not configure.
 */
export function isHttps(request: FastifyRequest): boolean {
  const forwarded = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (forwardedProto === "https") return true;
  return request.protocol === "https";
}

const COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: "lax" as const, path: "/" };

/**
 * `AI_KM_SESSION_COOKIE_DOMAIN` (E02-S033, optional). Unset (the default) ->
 * a host-only cookie, which is all `apps/web`/`apps/admin` on the same host
 * need. Threaded into every place a `Set-Cookie` is emitted — including the
 * CLEARING ones — because a clear-cookie header whose `Domain` does not match
 * the one the cookie was originally set with does not actually delete it in
 * the browser; only setting it on login and forgetting it on logout/deny
 * would silently break sign-out wherever this env var is actually used.
 */
export function setSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  domain?: string,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...COOKIE_ATTRIBUTES,
    secure: isHttps(request),
    ...(domain ? { domain } : {}),
  });
}

export function clearSessionCookie(reply: FastifyReply, request: FastifyRequest, domain?: string): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    ...COOKIE_ATTRIBUTES,
    secure: isHttps(request),
    ...(domain ? { domain } : {}),
  });
}

async function denyUnauthenticated(
  request: FastifyRequest,
  reply: FastifyReply,
  domain?: string,
): Promise<void> {
  clearSessionCookie(reply, request, domain);
  await reply.code(401).send({ code: "UNAUTHENTICATED", message: "請先登入。" });
}

/**
 * The real check: valid, unexpired, non-idle, non-disabled session cookie ->
 * `request.auth` populated and `last_seen_at` slid forward. Anything else ->
 * 401 `UNAUTHENTICATED` with the cookie cleared, and the route handler never
 * runs (AC9) because a preHandler that has already sent a reply stops
 * Fastify's lifecycle there.
 */
export function buildRealRequireSession(db: Database, cookieDomain?: string): preHandlerHookHandler {
  return async function realRequireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) {
      await denyUnauthenticated(request, reply, cookieDomain);
      return;
    }

    const row = findSessionWithUserByTokenHash(db, hashSessionToken(token));
    if (!row) {
      await denyUnauthenticated(request, reply, cookieDomain);
      return;
    }

    const nowMs = Date.now();
    const expiresAtMs = Date.parse(row.expires_at);
    const idleMs = nowMs - Date.parse(row.last_seen_at);

    if (nowMs >= expiresAtMs || idleMs > SESSION_IDLE_LIMIT_MS || row.disabled === 1) {
      // Tampered/expired/idle/since-disabled all collapse to the same 401 —
      // none of them should be distinguishable to the caller, and the row is
      // purged either way so a retried request does the same work again
      // rather than re-checking a session everyone already knows is dead.
      deleteSessionById(db, row.session_id);
      await denyUnauthenticated(request, reply, cookieDomain);
      return;
    }

    touchSession(db, row.session_id, new Date(nowMs).toISOString());

    const auth: AuthContext = {
      userId: row.user_id,
      ownerKey: row.owner_key,
      roles: JSON.parse(row.roles) as string[],
      sessionId: row.session_id,
    };
    request.auth = auth;
  };
}

export function composeRequireSession(
  realRequireSession: preHandlerHookHandler,
  previous: preHandlerHookHandler | undefined,
  cookieDomain?: string,
): preHandlerHookHandler {
  return async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      await (realRequireSession as (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>)(
        request,
        reply,
      );
      return;
    }
    if (previous) {
      // Neither E04-S039 handler this ever falls back to reads `this`, so a
      // plain call (no `.call(app, …)`) is safe — see the module docstring.
      await (previous as (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>)(request, reply);
      return;
    }
    await denyUnauthenticated(request, reply, cookieDomain);
  };
}

/**
 * `requireAnyRole` (E02-S033) — the minimal RBAC slice: an intersection
 * check, nothing more. Full `resource:action` evaluation remains E02-S007/
 * S016. Must run AFTER `requireSession` in a route's `preHandler` array —
 * it trusts `request.auth` is already populated and fails closed (401) if
 * it is not, rather than assuming "no auth" means "allow".
 *
 * `super_administrator` always passes, matching the semantics
 * `apps/admin/src/lib/admin-route-access.ts` already establishes (every
 * one of its route entries additionally grants `super_administrator`) —
 * enforced here too so a caller that forgets to list it explicitly does
 * not accidentally lock the top role out.
 */
export function requireAnyRole(roles: readonly Role[]): preHandlerHookHandler {
  return async function requireAnyRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = request.auth;
    if (!auth) {
      // requireSession did not run first, or denied — either way there is
      // nothing to authorize. Fail closed rather than assume "allow".
      await reply.code(401).send({ code: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    if (auth.roles.includes("super_administrator" satisfies Role)) return;
    if (roles.some((role) => auth.roles.includes(role))) return;

    // AC3: the required-roles list never appears in the body — it would
    // hand an unauthorized caller a map of what to try next.
    await reply.code(403).send({ code: "PERMISSION_DENIED", message: "沒有執行這個操作的權限。" });
  };
}
