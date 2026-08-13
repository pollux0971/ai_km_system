import { test, expect } from "@playwright/test";

/**
 * Scaffold smoke test only — proves the E2E pipeline (webServer boot +
 * Playwright run) resolves end-to-end. Real critical-flow E2E specs get
 * added alongside their story per the Definition of Done, starting with the
 * suggested vertical slice (login -> chat streaming/citation).
 */
test("apps/web scaffold page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI KM — apps/web" })).toBeVisible();
});
