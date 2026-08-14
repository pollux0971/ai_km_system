import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S025 critical flow: deleting a conversation from its detail page,
 * behind an explicit confirm step. Navigation after login always uses
 * in-app link clicks, never page.goto() — see conversations.spec.ts's
 * file doc comment for why.
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
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S025: deleting a conversation removes it and returns to the list, where it no longer appears", async ({ page }) => {
  await openConversation(page);

  await page.getByRole("button", { name: "刪除對話" }).click();
  await expect(page.getByText("確定要刪除「產品保固政策詢問」嗎？此操作無法復原。")).toBeVisible();
  await page.getByRole("button", { name: "確認刪除" }).click();

  await page.waitForURL((url) => url.pathname === "/conversations");
  await expect(page.getByText("產品保固政策詢問")).toHaveCount(0);
});

test("E03-S025: 取消 dismisses the confirmation without deleting anything", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByRole("button", { name: "刪除對話" }).click();
  await page.getByRole("button", { name: "取消" }).click();

  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByRole("heading", { name: "產品保固政策詢問", level: 1 })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await expect(page.getByText("產品保固政策詢問")).toBeVisible();
});
