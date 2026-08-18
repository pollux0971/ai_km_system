import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S022 critical flow: the conversation list route paginates instead
 * of showing every conversation at once. This mock's fixed 3-item
 * SAMPLE_CONVERSATIONS seed (apps/web/src/lib/conversations.ts) and
 * CONVERSATIONS_PAGE_SIZE of 2 together give exactly 2 pages without
 * this file needing to create any conversations itself — see
 * conversations.ts's own doc comment for why 2 was chosen specifically
 * to make this true. Page order is insertion order (SAMPLE_CONVERSATIONS
 * as defined, since nothing in this file creates a new conversation to
 * shift it): 產品保固政策詢問, 設備 E-204 錯誤代碼排查 on page 1;
 * Q3 銷售報表彙整 on page 2.
 *
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

async function openConversationList(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
}

// Scoped to <main> — the sidebar's own "歷史對話" rail lists every active
// conversation's title regardless of this page's pagination, so an
// unscoped getByText for any of these titles is either ambiguous (when
// also on the current page) or wrongly non-zero (when checking absence
// from a page the sidebar still shows it on).
function mainContent(page: import("@playwright/test").Page) {
  return page.getByRole("main");
}

test("E03-S022: page 1 shows the 2 most recent conversations, with 上一頁 disabled", async ({ page }) => {
  await openConversationList(page);

  await expect(mainContent(page).getByText("產品保固政策詢問")).toBeVisible();
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toBeVisible();
  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toHaveCount(0);

  await expect(page.getByText("第 1 頁，共 2 頁")).toBeVisible();
  await expect(page.getByRole("button", { name: "上一頁" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下一頁" })).toBeEnabled();
});

test("E03-S022: 下一頁 navigates to page 2, showing the remaining conversation and disabling 下一頁", async ({ page }) => {
  await openConversationList(page);

  await page.getByRole("button", { name: "下一頁" }).click();

  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toBeVisible();
  await expect(mainContent(page).getByText("產品保固政策詢問")).toHaveCount(0);
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toHaveCount(0);

  await expect(page.getByText("第 2 頁，共 2 頁")).toBeVisible();
  await expect(page.getByRole("button", { name: "下一頁" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "上一頁" })).toBeEnabled();
});

test("E03-S022: 上一頁 returns from page 2 back to page 1", async ({ page }) => {
  await openConversationList(page);

  await page.getByRole("button", { name: "下一頁" }).click();
  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toBeVisible();

  await page.getByRole("button", { name: "上一頁" }).click();

  await expect(mainContent(page).getByText("產品保固政策詢問")).toBeVisible();
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toBeVisible();
  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toHaveCount(0);
  await expect(page.getByText("第 1 頁，共 2 頁")).toBeVisible();
});
