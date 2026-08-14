import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S001 critical flow: the knowledge base list route. First story of
 * E05 (Knowledge Management Experience) — nav-items.ts's "/knowledge"
 * entry already existed (added by E01-S006 as an anticipated entry
 * point, per that file's own doc comment), so this is the first time
 * the route it points to actually renders anything instead of 404ing.
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

test("E05-S001: knowledge base list shows the seeded knowledge bases", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");

  await expect(page.getByRole("heading", { name: "知識庫", level: 1 })).toBeVisible();
  await expect(page.getByText("產品保固政策")).toBeVisible();
  await expect(page.getByText("設備維修標準作業程序")).toBeVisible();
});
