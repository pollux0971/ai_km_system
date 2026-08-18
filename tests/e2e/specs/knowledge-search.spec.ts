import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S002 critical flow: searching the knowledge base list by name.
 * This mock's fixed 3-item seed (apps/web/src/lib/knowledge-bases.ts):
 * 產品保固政策, 設備維修標準作業程序, 人力資源與請假規範.
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

async function openKnowledgeList(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
}

// ux/enterprise-polish added a sidebar "歷史對話" rail listing every
// active conversation's title — the seeded "產品保固政策詢問" conversation
// makes an unscoped getByText("產品保固政策") ambiguous (substring match
// against both the sidebar link and this page's own knowledge base link).
// Scoped to <main>, matching this codebase's established fix for the same
// collision (see home-dashboard.spec.ts's dashboardMain).
function mainContent(page: import("@playwright/test").Page) {
  return page.getByRole("main");
}

test("E05-S002: searching by name filters the list to only matching knowledge bases", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByLabel("搜尋知識庫").fill("保固");

  await expect(mainContent(page).getByText("產品保固政策")).toBeVisible();
  await expect(page.getByText("設備維修標準作業程序")).toHaveCount(0);
  await expect(page.getByText("人力資源與請假規範")).toHaveCount(0);
});

test("E05-S002: a search matching nothing shows a distinct message, not the generic empty state", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByLabel("搜尋知識庫").fill("這個字串不會符合任何知識庫名稱");

  await expect(page.getByText("查無符合「這個字串不會符合任何知識庫名稱」的知識庫。")).toBeVisible();
  await expect(page.getByText("尚無知識庫。")).toHaveCount(0);
});

test("E05-S002: clearing the search restores the full unfiltered list", async ({ page }) => {
  await openKnowledgeList(page);

  const searchInput = page.getByLabel("搜尋知識庫");
  await searchInput.fill("保固");
  await expect(page.getByText("設備維修標準作業程序")).toHaveCount(0);

  await searchInput.fill("");

  await expect(mainContent(page).getByText("產品保固政策")).toBeVisible();
  await expect(page.getByText("設備維修標準作業程序")).toBeVisible();
});
