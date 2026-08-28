import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

/**
 * E03-S035 AC5 (deferred at that story's own Definition of Done pending
 * this story's real cookie-session infra — see E03-S035's EVIDENCE): a
 * second tab in the same logged-in browser context lands directly on a
 * protected route without bouncing through /login; a hard page.reload()
 * keeps the session (the real HTTP cookie survives a reload, unlike the
 * mock AuthClient's in-memory session other E2E specs in this repo work
 * around — see answer-ok-feedback.spec.ts's file doc comment); logging out
 * from either tab invalidates the session for both.
 */

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

async function logout(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "mock-user-1" }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
}

test("a second tab in the same session lands directly on a protected route, without bouncing to /login", async ({ context, page }) => {
  await loginAs(page, { username: "demo-user" });

  const secondTab = await context.newPage();
  await secondTab.goto("/conversations");
  // No redirect: the session cookie is already valid for this new tab.
  await expect(secondTab).toHaveURL((url) => url.pathname === "/conversations");
  await expect(secondTab.getByRole("heading", { name: "對話" })).toBeVisible();
});

test("a hard reload keeps the session — the real cookie survives, unlike the mock AuthClient's in-memory one", async ({ page }) => {
  await loginAs(page, { username: "demo-user" });
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.reload();

  await expect(page).toHaveURL((url) => url.pathname === "/conversations");
  await expect(page.getByRole("heading", { name: "對話" })).toBeVisible();
});

test("logging out from one tab invalidates the session for both — each tab's next navigation goes to /login", async ({ context, page }) => {
  await loginAs(page, { username: "demo-user" });
  const secondTab = await context.newPage();
  await secondTab.goto("/conversations");
  await expect(secondTab).toHaveURL((url) => url.pathname === "/conversations");

  await logout(page);

  // The second tab's session was invalidated server-side by the logout
  // above (same cookie, same server-side session row) — its NEXT
  // navigation (not necessarily its already-rendered current view) must
  // bounce to /login, same as the first tab's logout already did.
  await secondTab.goto("/conversations");
  await expect(secondTab).toHaveURL((url) => url.pathname === "/login");
});
