import { defineConfig } from "vitest/config";

/**
 * E04-S057. tests/e2e's own `test` script (`playwright test`) must keep
 * meaning exactly that — see the story's AC6 (root `pnpm test` must keep
 * covering E2E, not silently be replaced). This is a SEPARATE `test:unit`
 * script for unit-testing the plain-Node logic in `helpers/*.ts`
 * (lock-guard.ts's file-based decision logic has no Playwright/browser
 * dependency at all), scoped away from `specs/**` — this story's own
 * Development Boundaries forbid touching `specs/*.spec.ts` content.
 */
export default defineConfig({
  test: {
    include: ["helpers/**/*.test.ts"],
  },
});
