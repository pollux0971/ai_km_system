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
    "@ai-km/validation",
  ],
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
        // See apps/web/next.config.ts's doc comment: only sent when
        // `x-forwarded-proto: https` is present (ADR 0003 §6 reverse-proxy
        // TLS termination), never on the plain-http internal deployment.
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
      },
    ];
  },
  // E11-S026 (mirrors apps/web/next.config.ts from E03-S035): same-origin
  // proxy so the browser only ever talks to :3001. Server-side only —
  // API_INTERNAL_URL never reaches the client bundle.
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiInternalUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
