import type { NextConfig } from "next";

/**
 * E01-S029. Same as `apps/web/next.config.ts` — the `Content-Security-Policy`
 * header is set by `src/middleware.ts` (needs a per-request nonce); the
 * headers below have no per-request state, so they stay here. See
 * `apps/web/src/middleware.ts`'s doc comment for the full CSP rationale.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Identical value to apps/web — the spec's technical decision states one
  // shared header set for both apps, not a per-app value. apps/admin has no
  // voice input feature today, but narrowing this here would be an invented
  // deviation from the spec text, not a spec-authorized difference.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-km/ui",
    "@ai-km/design-tokens",
    "@ai-km/types",
    "@ai-km/api-client",
    "@ai-km/auth-client",
    "@ai-km/permissions",
    "@ai-km/logger",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // See apps/web/next.config.ts's doc comment: only sent when
        // `x-forwarded-proto: https` is present (ADR 0003 §6 reverse-proxy
        // TLS termination), never on the plain-http internal deployment.
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
      },
    ];
  },
};

export default nextConfig;
