import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

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

/**
 * E01-S020: the E01 golden path, one continuous flow through every
 * shell capability this epic delivered, in the order a real user would
 * hit them. This is deliberately NOT a re-verification of each feature's
 * edge cases and branches — every other spec in this directory already
 * does that in depth (roles, error states, validation, etc.). This test
 * only proves the pieces still connect together as one working system;
 * a break anywhere in this path is a fast, single-test signal that
 * something fundamental in the shell regressed, before reaching for the
 * full suite to localize which specific piece.
 */
test("E01-S020: golden path — anonymous visit, login, dashboard, profile, notifications, logout, session cleared", async ({
  page,
}) => {
  // 1. Anonymous visit to a protected route redirects to login (E01-S004).
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();

  // 2. Local login succeeds and lands back on the dashboard (E01-S002/S003).
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // 3. The authenticated shell chrome and dashboard content both render
  //    (E01-S005/S007/S008/S009).
  await expect(page.getByRole("navigation", { name: "主導覽" })).toBeVisible();
  await expect(page.getByText("AI KM", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近對話", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "快速入口", level: 2 })).toBeVisible();

  // 4. The notification center opens and shows content (E01-S014).
  await page.getByRole("button", { name: "通知（2）" }).click();
  await expect(page.getByRole("dialog", { name: "通知中心" })).toBeVisible();
  await page.keyboard.press("Escape");

  // 5. The user-menu reaches the profile view with real account fields
  //    (E01-S010).
  await page.getByRole("button", { name: MOCK_VALID_USER_ID }).click();
  await page.getByRole("menuitem", { name: "個人資料" }).click();
  await page.waitForURL((url) => url.pathname === "/profile");
  await expect(page.getByRole("heading", { name: "個人資料", level: 1 })).toBeVisible();

  // 6. Navigating back to the dashboard via the sidebar still works
  //    (the shell survives leaving and returning to the home route).
  await page.getByRole("navigation", { name: "主導覽" }).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeVisible();

  // 7. Logout clears the session and returns to login (E01-S005).
  await page.getByRole("button", { name: MOCK_VALID_USER_ID }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.waitForURL((url) => url.pathname === "/login");

  // 8. The session is genuinely cleared, not just a UI-only redirect —
  //    revisiting a protected route redirects to login again instead of
  //    silently reusing a stale session.
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
});
