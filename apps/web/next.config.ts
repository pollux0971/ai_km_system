import type { NextConfig } from "next";

/**
 * E01-S029. The `Content-Security-Policy` header itself is set by
 * `src/middleware.ts`, not here — it needs a fresh per-request nonce for
 * `script-src`, which `next.config.ts`'s static `headers()` cannot produce.
 * See that file's doc comment for the full CSP rationale (including why a
 * nonce, not `'unsafe-inline'`, is required — archive/stories/E01-S029.md has
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
  /**
   * E03-S039. Next.js's default gzip compression (Node's `compression`
   * middleware under the hood) wraps EVERY response this server sends,
   * including `rewrites()`-proxied ones — it has no concept of "this
   * content-type must stream live," so it buffers output waiting for
   * either a full compressible chunk or stream end before flushing
   * anything to the browser. For `/api/v1/conversations/events` (SSE,
   * `text/event-stream`) that means the connection opens successfully
   * (headers arrive) but no event frame is ever actually delivered while
   * the connection is open.
   *
   * Confirmed by diagnosing the exact same request three ways: directly
   * against `apps/api` (no `content-encoding`, streams the
   * `conversation.created` frame instantly on mutation), through this
   * rewrite (`content-encoding: gzip`, never streams — connection opens,
   * nothing ever arrives), and through the rewrite again with an added
   * `Cache-Control: no-transform` response header on this one route
   * (ai-km-e4's hypothesis that Next's compression middleware would
   * honor it and skip compressing — it did not: still `gzip`, still
   * never streams). That negative result is why `compress: false` is the
   * fix taken here rather than a scoped, per-route exemption — there
   * turned out not to be one available.
   *
   * `compress: false` disables gzip SITE-WIDE, not just for this one
   * route — Next.js's rewrite path has no per-route compression toggle
   * that actually works. That is a real, permanent cost: every HTML/JS/
   * CSS/JSON response `apps/web` serves loses gzip. Every real
   * deployment already terminates behind a reverse proxy (this file's
   * own HSTS comment below), which is the standard place to handle
   * compression in production — this removes a redundant (and here,
   * actively broken) second compression layer rather than removing the
   * only one. Tech debt: revertible if a future Next.js version exposes
   * a per-route/per-content-type compression exemption for rewrites, or
   * if the SSE endpoint moves off `rewrites()` onto a custom Route
   * Handler that streams a `ReadableStream` directly (Route Handlers are
   * not subject to this same compression wrapping).
   */
  compress: false,
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
  // 2026-09-05(ADR 0017 那一輪的附帶修正,顧問裁決 #「共用檔改法 (a)」):
  // `packages/api-client` 的相對 import 補上了 `.js` 副檔名,好讓 `features` 的
  // NodeNext 解析能把 `apps/web/src/lib/conversation-events.ts` 綁進自動場景
  // (在那之前恰好 9 條 TS2834/TS2835,實測過)。
  //
  // 代價落在這裡:Next 的 webpack 預設**不會**把 `./client.js` 對回 `./client.ts`,
  // 於是 `transpilePackages` 底下的原始碼解不開,build 直接紅
  // (`Module not found: Can't resolve './client.js'`)。
  // `extensionAlias` 就是官方給這個情況的開關——它讓 TS 的「寫 .js、實際是 .ts」
  // 這個 ESM 慣例在 bundler 這一側也成立。
  //
  // ⚠️ 這一段與 `packages/api-client` 的副檔名是**同一個決定的兩半**,拆開任何一半都會紅。
  webpack(config: { resolve: { extensionAlias?: Record<string, string[]> } }) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
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
