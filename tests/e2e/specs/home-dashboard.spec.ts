import { test, expect } from "@playwright/test";
import {
  MOCK_MAINTENANCE_USERNAME,
  MOCK_SALES_USERNAME,
  MOCK_VALID_PASSWORD,
  MOCK_VALID_USER_ID,
  MOCK_VALID_USERNAME,
} from "@ai-km/auth-client";

async function login(page: import("@playwright/test").Page, username = MOCK_VALID_USERNAME) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(username);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/**
 * Scoped to the page's <main> — the sidebar (specs/app-shell.spec.ts)
 * lives outside it but reuses the same labels ("維修助手" / "ERP 助手")
 * for its own links, so an unscoped locator here would hit both.
 */
function dashboardMain(page: import("@playwright/test").Page) {
  return page.getByRole("main");
}

/**
 * E01-S007/E01-S008/E01-S009 critical flow: the home dashboard's own
 * content (greeting + both widgets), distinct from the shell chrome
 * E01-S005 covers.
 */
test("home dashboard greets the user and shows both widget sections", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeVisible();
  await expect(page.getByText(`${MOCK_VALID_USER_ID}，這是你的工作台首頁。`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近對話", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "快速入口", level: 2 })).toBeVisible();
});

test("E01-S008: Recent Conversations widget shows sample conversations and a view-all link", async ({
  page,
}) => {
  await login(page);

  // Scoped to <main> — the sidebar's own "歷史對話" rail links to the same
  // seeded conversation by the same title, so an unscoped getByText here
  // is ambiguous.
  await expect(dashboardMain(page).getByText("產品保固政策詢問")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看全部對話" })).toHaveAttribute("href", "/conversations");
});

test("E01-S009: a general_user's entry cards show only Knowledge", async ({ page }) => {
  await login(page, MOCK_VALID_USERNAME);

  await expect(dashboardMain(page).getByRole("link", { name: /知識庫/ })).toBeVisible();
  await expect(dashboardMain(page).getByRole("link", { name: /維修助手/ })).not.toBeVisible();
  await expect(dashboardMain(page).getByRole("link", { name: /ERP 助手/ })).not.toBeVisible();
});

test("E01-S009: a maintenance_engineer's entry cards include Maintenance", async ({ page }) => {
  await login(page, MOCK_MAINTENANCE_USERNAME);

  await expect(dashboardMain(page).getByRole("link", { name: /維修助手/ })).toBeVisible();
  await expect(dashboardMain(page).getByRole("link", { name: /ERP 助手/ })).not.toBeVisible();
});

test("E01-S009: a sales_purchasing user's entry cards include ERP", async ({ page }) => {
  await login(page, MOCK_SALES_USERNAME);

  await expect(dashboardMain(page).getByRole("link", { name: /ERP 助手/ })).toBeVisible();
  await expect(dashboardMain(page).getByRole("link", { name: /維修助手/ })).not.toBeVisible();
});
