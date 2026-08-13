import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S002 critical flow: the conversation detail shell and its mode
 * switch. Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why
 * (the mock AuthClient's session is a plain in-memory closure variable
 * with no cookie/localStorage backing; a hard reload wipes it).
 *
 * The "not found" state (conversation id doesn't match anything) isn't
 * covered here — unlike E01-S017's /maintenance case (a route with no
 * page.tsx at all, so it 404s at the root before ever reaching
 * SessionGate regardless of auth state), /conversations/[id] is a real
 * dynamic route that DOES go through SessionGate. Reaching it with an
 * invalid id requires either a UI link to a nonexistent conversation
 * (nothing in the app produces one) or page.goto() (which would wipe
 * the session and redirect to /login before ever reaching the
 * not-found UI, testing nothing useful). Covered instead, and just as
 * rigorously, by conversation-detail.test.tsx's dedicated component
 * test — the same pattern already used for E03-S001's own E2E gaps.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

test("E03-S002: opening a conversation shows its title and current mode", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "Q3 銷售報表彙整" is mode "advanced".
  await page.getByRole("link", { name: "Q3 銷售報表彙整" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("heading", { name: "Q3 銷售報表彙整", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "一般模式" })).toHaveAttribute("aria-pressed", "false");
});

test("E03-S002: switching mode persists across leaving and returning to the conversation", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "產品保固政策詢問" is mode "normal".
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  const conversationUrl = page.url();

  await expect(page.getByRole("button", { name: "一般模式" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "進階模式" }).click();
  await expect(page.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true");

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true");
});
