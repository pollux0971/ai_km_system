import { test, expect } from "@playwright/test";

/**
 * Scaffold smoke test only — proves the E2E pipeline (webServer boot +
 * Playwright run) resolves end-to-end. Real critical-flow E2E specs get
 * added alongside their story per the Definition of Done, starting with the
 * suggested vertical slice (login -> chat streaming/citation).
 *
 * Since E01-S004, "/" sits behind SessionGate, so an unauthenticated visit
 * no longer renders the scaffold heading directly — it redirects to
 * /login first. The authenticated-home-renders case (login, then land on
 * "/") is covered by specs/session-gate.spec.ts; this still proves the
 * pipeline boots end-to-end via the redirect outcome.
 */
test("apps/web scaffold page redirects an unauthenticated visitor to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
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
