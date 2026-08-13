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

/**
 * E01-S001 route-skeleton seam: the (app) and (public) route groups must
 * both resolve to their pre-existing URLs after the restructure, and an
 * unknown path must fall through to the route-tree not-found page.
 * The /login heading assertion tracks E01-S002's real content — the login
 * flow's own states are covered in depth by specs/login.spec.ts.
 */
test("E01-S001: (public) zone /login route resolves", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
});

test("E01-S001: unknown route falls through to not-found", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
});
