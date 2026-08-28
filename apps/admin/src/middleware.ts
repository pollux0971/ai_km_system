import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Bootstrap-level telemetry plumbing for E11-S001 (Functional AC 6:
 * "成功與失敗路徑皆具有 correlation id"). Mirrors apps/web's own
 * middleware.ts (E01-S001) exactly — same correlation-id stamping
 * reasoning applies identically here; this isn't a domain-specific
 * decision that could diverge between the two apps.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * E01-S029 CSP nonce. Same mechanism and same reasoning as
 * `apps/web/src/middleware.ts` — see that file's doc comment for the full
 * investigation (curl + CSP-violation-survey evidence in
 * docs/stories/E01-S029.md) behind why a nonce, not `'unsafe-inline'`, is
 * required for Next.js App Router's own inline RSC bootstrap script.
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
