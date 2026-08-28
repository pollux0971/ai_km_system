import type { NextConfig } from "next";

/**
 * E01-S029. The `Content-Security-Policy` header itself is set by
 * `src/middleware.ts`, not here — it needs a fresh per-request nonce for
 * `script-src`, which `next.config.ts`'s static `headers()` cannot produce.
 * See that file's doc comment for the full CSP rationale (including why a
 * nonce, not `'unsafe-inline'`, is required — docs/stories/E01-S029.md has
 * the investigation).
 *
 * The 5 headers below have no per-request state, so they stay here.
 * `font-src` inside the CSP (middleware.ts) is deliberately NOT widened to
 * `fonts.googleapis.com` / `fonts.gstatic.com` — E01-S022 self-hosts fonts
 * specifically to avoid that dependency.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): E03-S040/S041 push-to-talk voice input needs
  // same-origin mic access. camera/geolocation are never used — denied
  // outright rather than left unspecified.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-km/ui",
    "@ai-km/design-tokens",
    "@ai-km/types",
    "@ai-km/api-client",
    "@ai-km/auth-client",
    "@ai-km/logger",
    "@ai-km/permissions",
    "@ai-km/validation",
  ],
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiInternalUrl}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // HSTS only when the request arrived over TLS. Next.js's config-level
        // headers() cannot inspect the connection directly, but every real
        // deployment terminates TLS at a reverse proxy that sets
        // `x-forwarded-proto` (ADR 0003 §6) — this `has` matcher is exactly
        // that signal. Never sent on the plain-http internal dev deployment,
        // which would otherwise get HSTS-locked out of ever using http again.
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
      },
    ];
  },
};

export default nextConfig;
