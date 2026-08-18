import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S024 critical flow: renaming a conversation from its detail page.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S024: renaming a conversation updates the heading and persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByRole("button", { name: "重新命名" }).click();
  await page.getByLabel("對話名稱").fill("2026 年保固政策彙整");
  await page.getByRole("button", { name: "儲存" }).click();

  await expect(page.getByRole("heading", { name: "2026 年保固政策彙整", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "產品保固政策詢問", level: 1 })).toHaveCount(0);

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // The new title also appears in the list — same underlying store.
  // Scoped to <main> — the sidebar's own "歷史對話" rail also picks up the
  // renamed title (once its own async refetch resolves), so an unscoped
  // getByText here is ambiguous.
  await expect(page.getByRole("main").getByText("2026 年保固政策彙整")).toBeVisible();

  await page.getByRole("main").getByText("2026 年保固政策彙整").click();
  await page.waitForURL(conversationUrl);
  await expect(page.getByRole("heading", { name: "2026 年保固政策彙整", level: 1 })).toBeVisible();
});

test("E03-S024: 取消 discards the draft without renaming", async ({ page }) => {
  await openConversation(page);

  await page.getByRole("button", { name: "重新命名" }).click();
  await page.getByLabel("對話名稱").fill("這個不該被儲存");
  await page.getByRole("button", { name: "取消" }).click();

  await expect(page.getByRole("heading", { name: "產品保固政策詢問", level: 1 })).toBeVisible();
  await expect(page.getByLabel("對話名稱")).toHaveCount(0);
});

test("E03-S024: 儲存 is disabled for an empty draft, preventing an empty title from being submitted", async ({ page }) => {
  await openConversation(page);

  await page.getByRole("button", { name: "重新命名" }).click();
  await page.getByLabel("對話名稱").fill("");

  await expect(page.getByRole("button", { name: "儲存" })).toBeDisabled();
});
