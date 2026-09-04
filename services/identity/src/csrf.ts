/**
 * CSRF defence (E04-S048, ADR 0005 addendum).
 *
 * Fused into `buildRealRequireSession` (`require-session.ts`) rather than
 * mounted as a separate `preHandler` on each domain's own route
 * definitions — see that file's docstring and `archive/stories/E04-S048.md`
 * for the full reasoning (short version: the literal "mount a preHandler in
 * each of the four plugins' route files" mechanism the spec describes
 * collides with those plugins' own isolated unit-test harnesses, which
 * install their OWN fake `requireSession` and therefore would ALSO execute
 * a preHandler baked into the route definition itself — breaking AC2's own
 * "existing route tests, zero modification" requirement). Every protected
 * route already calls the real `requireSession` when running inside the
 * actual assembled `apps/api` server, so checking here reaches every one of
 * them without touching their files at all.
 *
 * `apps/api/src/csrf/**` (the directory the spec names) holds this
 * feature's full-stack "does every real route actually enforce this"
 * regression test instead — the one thing that genuinely can only be
 * written where the fully assembled server exists.
 */
import type { FastifyRequest } from "fastify";

export const CSRF_HEADER = "x-requested-with";
export const CSRF_ERROR_CODE = "CSRF_HEADER_MISSING";
export const CSRF_ERROR_MESSAGE = "此請求缺少必要的防護標頭,已拒絕。";

/**
 * GET/HEAD/OPTIONS never change state, so they are never checked — this is
 * a hard requirement, not an optimisation: `EventSource` (E04-S044's SSE
 * stream) cannot set custom headers at all, and gating this on method is
 * what keeps that endpoint usable. See archive/stories/E04-S048.md's red-line
 * note.
 */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function headerValue(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isMultipartFormData(request: FastifyRequest): boolean {
  const contentType = headerValue(request.headers["content-type"]);
  return (
    contentType !== undefined &&
    contentType.toLowerCase().startsWith("multipart/form-data")
  );
}

/** Loopback is always allowed regardless of `AI_KM_CORS_ORIGINS`, so local dev works with zero extra config. */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function originOf(request: FastifyRequest): string | undefined {
  const origin = headerValue(request.headers.origin);
  if (origin) return origin;
  const referer = headerValue(request.headers.referer);
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export interface CsrfCheckResult {
  readonly allowed: boolean;
}

/**
 * The whole decision, method-gated: GET/HEAD/OPTIONS always pass;
 * multipart POST/PUT/PATCH/DELETE (the browser-`<form>`-uploadable shape —
 * `/transcriptions`, AC4) checks `Origin`/`Referer` against the allowlist
 * instead of the header, because a plain HTML form cannot set a custom
 * header but CAN send multipart; everything else requires the header.
 *
 * Origin AND Referer both absent -> denied. A same-origin `fetch`/`XHR`
 * POST always carries `Origin` per the Fetch standard (unlike a top-level
 * navigation, which does not always send it) — this endpoint is only ever
 * called by `@ai-km/api-client`'s `fetch`-based multipart upload, never by
 * a plain form navigation, so a request with neither header is either a
 * misbehaving/ancient client or an actual attack; failing closed does not
 * cost a legitimate caller anything. Documented per the spec's own "此組合
 * 決策寫進 EVIDENCE" instruction — see archive/stories/E04-S048.md.
 */
export function checkCsrf(
  request: FastifyRequest,
  allowedOrigins: readonly string[],
): CsrfCheckResult {
  const method = request.method.toUpperCase();
  if (!STATE_CHANGING_METHODS.has(method)) return { allowed: true };

  if (isMultipartFormData(request)) {
    const origin = originOf(request);
    if (!origin) return { allowed: false };
    const ok = isLoopbackOrigin(origin) || allowedOrigins.includes(origin);
    return { allowed: ok };
  }

  return { allowed: headerValue(request.headers[CSRF_HEADER]) !== undefined };
}
