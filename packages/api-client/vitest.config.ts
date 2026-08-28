import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to node — openapi-typescript's cross-file $ref resolution reads specs via
    // file:// URLs and must not depend on jsdom's fetch/URL globals. client.test.ts opts
    // into jsdom per-file (it needs `sessionStorage`) via a `@vitest-environment` docblock.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
