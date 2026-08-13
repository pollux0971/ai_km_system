import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-km/ui",
    "@ai-km/design-tokens",
    "@ai-km/types",
    "@ai-km/api-client",
    "@ai-km/auth-client",
    "@ai-km/logger",
    "@ai-km/validation",
  ],
};

export default nextConfig;
