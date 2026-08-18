import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S023 critical flow: searching the conversation list by title.
 * This mock's fixed 3-item seed (apps/web/src/lib/conversations.ts):
 * 產品保固政策詢問, 設備 E-204 錯誤代碼排查, Q3 銷售報表彙整.
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
// conversation's title unfiltered by this page's own search box, so an
// unscoped getByText for any of these titles is either ambiguous (still
// matching) or wrongly non-zero (filtered out of the main list here, but
// the sidebar still shows it).
function mainContent(page: import("@playwright/test").Page) {
  return page.getByRole("main");
}

test("E03-S023: searching by title filters the list to only matching conversations", async ({ page }) => {
  await openConversationList(page);

  await page.getByLabel("搜尋對話").fill("保固");

  await expect(mainContent(page).getByText("產品保固政策詢問")).toBeVisible();
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toHaveCount(0);
  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toHaveCount(0);
});

test("E03-S023: a search matching a single item across pages shows no pagination controls", async ({ page }) => {
  await openConversationList(page);

  // "Q3 銷售報表彙整" is normally on page 2 (E03-S022's pagination) —
  // searching for it directly should surface it without needing to
  // navigate pages first, and without showing pagination controls for
  // what is now a single-item filtered result.
  await page.getByLabel("搜尋對話").fill("報表");

  await expect(mainContent(page).getByText("Q3 銷售報表彙整")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "對話列表分頁" })).toHaveCount(0);
});

test("E03-S023: a search matching nothing shows a distinct message, not the generic empty state", async ({ page }) => {
  await openConversationList(page);

  await page.getByLabel("搜尋對話").fill("這個字串不會符合任何對話標題");

  await expect(page.getByText("查無符合「這個字串不會符合任何對話標題」的對話。")).toBeVisible();
  await expect(page.getByText("尚無對話，開始你的第一個對話。")).toHaveCount(0);
});

test("E03-S023: clearing the search restores the full unfiltered list", async ({ page }) => {
  await openConversationList(page);

  const searchInput = page.getByLabel("搜尋對話");
  await searchInput.fill("保固");
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toHaveCount(0);

  await searchInput.fill("");

  await expect(mainContent(page).getByText("產品保固政策詢問")).toBeVisible();
  await expect(mainContent(page).getByText("設備 E-204 錯誤代碼排查")).toBeVisible();
});
