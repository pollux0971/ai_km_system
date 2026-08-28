import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Bootstrap-level telemetry plumbing for E01-S001 (Functional AC 6:
 * "成功與失敗路徑皆具有 correlation id"). Stamps every request/response
 * with a correlation id — reusing one already set by an upstream
 * proxy/gateway when present, so distributed traces stay joined instead
 * of being reset at this hop. Client-side interaction telemetry (event
 * hooks) is a separate concern owned by E01-S019.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * E01-S029 CSP nonce. `default-src 'self'` is the fail-closed baseline;
 * `script-src` stays strict — no `'unsafe-inline'` — by using a fresh
 * per-request nonce plus `'strict-dynamic'`, the exact pattern Next.js's own
 * CSP guide documents
 * (https://nextjs.org/docs/app/guides/content-security-policy).
 *
 * This exists specifically because App Router's own RSC streaming bootstrap
 * (`self.__next_f.push(...)`) ships as an inline `<script>` with no `src` —
 * confirmed by curl + a CSP-violation survey during this story's own
 * investigation (docs/stories/E01-S029.md): every one of 38 collected
 * violations was this exact mechanism, nothing else. `'unsafe-eval'` (which
 * only covers `eval()`/`Function()`) cannot fix this; a nonce is required.
 * Next.js detects the nonce from THIS response header automatically and
 * reuses it for its own inline scripts — no application code has to thread
 * it through. `'strict-dynamic'` lets that one trusted, nonced script load
 * further scripts (webpack-chunked bundles) without each needing its own
 * nonce; browsers that honor `'strict-dynamic'` then ignore the `'self'`
 * source expression per the CSP3 spec, which is why `'self'` staying in the
 * list is still correct, not dead weight, for older/non-supporting clients.
 *
 * `'unsafe-eval'` remains dev-only (React Fast Refresh / webpack HMR under
 * `next dev`; verified empirically against a running dev server) — see
 * docs/stories/E01-S029.md for the full investigation. Production
 * (`next build && next start`, and every real deployment per ADR 0003) never
 * gets `'unsafe-eval'`.
 *
 * `style-src 'self' 'unsafe-inline'` and the rest of the directive list stay
 * exactly as before — nothing else needed the nonce treatment, per the same
 * violation survey.
 */
function buildCsp(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === "production"
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  return [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const incoming = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = incoming && incoming.trim().length > 0 ? incoming : crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(CORRELATION_ID_HEADER, correlationId);
  forwardedHeaders.set("x-nonce", nonce);
  forwardedHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
