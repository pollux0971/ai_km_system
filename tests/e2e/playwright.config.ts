import { defineConfig } from "@playwright/test";

/**
 * E11-S001 adds apps/admin as a second, independently-deployed app
 * (:3001) alongside apps/web (:3000) — its own webServer entry + its own
 * `admin` project (baseURL swapped, specs matched by an `admin-` file
 * prefix) so admin specs run against the right server without every
 * existing (and future) apps/web spec needing to know admin exists at
 * all. `web`'s own testIgnore is the mirror image of `admin`'s
 * testMatch, so a spec always belongs to exactly one project, never both
 * or neither. Both patterns intentionally aren't `^`-anchored — testMatch/
 * testIgnore match against each file's full absolute path, not its
 * basename, so an anchored pattern would never match a real file here.
 */
export default defineConfig({
  testDir: "./specs",
  webServer: [
    {
      command: "pnpm --filter @ai-km/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @ai-km/admin dev",
      url: "http://localhost:3001",
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: "web",
      testIgnore: /admin-.*\.spec\.ts$/,
      use: { baseURL: "http://localhost:3000" },
    },
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts$/,
      use: { baseURL: "http://localhost:3001" },
    },
  ],
});
