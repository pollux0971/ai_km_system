import type { NextConfig } from "next";

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
};

export default nextConfig;
