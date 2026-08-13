import { defineConfig } from "@playwright/test";

/**
 * Scaffold config only — no specs yet. First critical-flow E2E (per the
 * Definition of Done) gets added alongside its story, starting with the
 * suggested vertical slice (login -> chat streaming/citation).
 */
export default defineConfig({
  testDir: "./specs",
  webServer: {
    command: "pnpm --filter @ai-km/web dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
});
