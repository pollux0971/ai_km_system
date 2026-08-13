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

export function middleware(request: NextRequest) {
  const incoming = request.headers.get(CORRELATION_ID_HEADER);
  const correlationId = incoming && incoming.trim().length > 0 ? incoming : crypto.randomUUID();

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(CORRELATION_ID_HEADER, correlationId);

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
