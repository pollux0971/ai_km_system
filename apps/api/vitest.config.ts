import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The production-guard test spawns a real `node` process (AC6 asserts the
    // server does not merely refuse to serve, but never listens at all), which
    // is slower than an in-process assertion.
    testTimeout: 30_000,
  },
});
