import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S007 critical flow: adding/removing a knowledge base member via
 * the list editor at /knowledge/[id]/members, and confirming the detail
 * page (E05-S005) reflects it. Navigation after login always uses
 * in-app link clicks, never page.goto() — see conversations.spec.ts's
 * file doc comment for why (the mock AuthClient's session is a plain
 * in-memory closure variable; page.goto() is a hard reload that wipes
 * it).
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

async function openKnowledgeDetail(page: import("@playwright/test").Page, name: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  // ux/enterprise-polish added a sidebar "歷史對話" rail listing every
  // active conversation's title — the seeded "產品保固政策詢問"
  // conversation makes an unscoped getByRole("link", { name }) ambiguous
  // (substring match) when `name` is "產品保固政策". Scoped to <main>,
  // matching this codebase's established fix for the same collision
  // (see home-dashboard.spec.ts's dashboardMain).
  await page.getByRole("main").getByRole("link", { name }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
}

test("E05-S007: adding a member on the member editor saves immediately and the detail page reflects it", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  await expect(page.getByText("尚無成員")).toBeVisible();

  await page.getByRole("link", { name: "成員設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/members$/.test(url.pathname));

  await page.getByLabel("新增成員(使用者代號)").fill("demo-maintenance");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("demo-maintenance")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("demo-maintenance")).toBeVisible();
  await expect(page.getByText("尚無成員")).toHaveCount(0);
});

test("E05-S007: removing every member returns the knowledge base to 尚無成員", async ({ page }) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await page.getByRole("link", { name: "成員設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/members$/.test(url.pathname));

  await page.getByLabel("新增成員(使用者代號)").fill("demo-sales");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("demo-sales")).toBeVisible();

  await page.getByRole("button", { name: "移除" }).click();
  await expect(page.getByText("尚無成員。")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("尚無成員")).toBeVisible();
});
