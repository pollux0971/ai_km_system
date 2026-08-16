import { test, expect } from "@playwright/test";
import { MOCK_SALES_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E09-S001 critical flow: the ERP assistant home route. First story of
 * E09 (AI ERP & Reporting Experience) — nav-items.ts's "/erp" entry
 * already existed (added by E01-S006/S009 as an anticipated entry point,
 * role-gated to sales_purchasing/super_administrator), so this is the
 * first time the route it points to actually renders anything instead of
 * 404ing — same relationship maintenance-home.spec.ts's own top doc
 * comment already documents for E07-S001/"/maintenance". See
 * route-guards.spec.ts's own updated doc comment for the E2E-level
 * consequence of this transition (its "page-less restricted route" test
 * is removed by this same story, having no route left to target).
 *
 * No general_user negative-authorization test here, for the same reason
 * maintenance-home.spec.ts's own top doc comment gives: a general_user
 * has no visible "ERP 助手" link to click, and a direct page.goto("/erp")
 * cannot reach RoleGuard's FORBIDDEN render either (the mock AuthClient's
 * session is in-memory only; a hard reload wipes it and SessionGate
 * redirects to /login first). The FORBIDDEN-vs-children branching itself
 * is already covered at the component level by role-guard.test.tsx.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_SALES_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

test("E09-S001: ERP assistant home shows the seeded ERP queries to a sales_purchasing user", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "ERP 助手" }).click();
  await page.waitForURL((url) => url.pathname === "/erp");

  await expect(page.getByRole("heading", { name: "ERP 助手", level: 1 })).toBeVisible();
  await expect(page.getByText("上個月各分公司的營收總額是多少?")).toBeVisible();
  await expect(page.getByText("目前庫存低於安全存量的品項有哪些?")).toBeVisible();
  await expect(page.getByText("本季應收帳款逾期客戶清單")).toBeVisible();

  // The one entry link E09-S002 added — but still no per-query links.
  // No story owns a per-query detail link from this list (see
  // erp-query-list.tsx's own doc comment). Scoped via the list itself —
  // an unscoped getByRole("list") also matches the sidebar's own nav
  // <ul>, which isn't what this is about.
  await expect(page.getByRole("link", { name: "開始新的 ERP 查詢" })).toHaveAttribute("href", "/erp/new");
  await expect(page.getByRole("main").getByRole("list").getByRole("link")).toHaveCount(0);
});

test("E09-S002: submitting a natural-language question creates a new ERP query and lands on its own page", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "ERP 助手" }).click();
  await page.waitForURL((url) => url.pathname === "/erp");

  await page.getByRole("link", { name: "開始新的 ERP 查詢" }).click();
  await page.waitForURL((url) => url.pathname === "/erp/new");

  await expect(page.getByRole("button", { name: "送出查詢" })).toBeDisabled();
  await page.getByLabel("輸入您的問題").fill("上季各產品線的毛利率是多少?");
  await expect(page.getByRole("button", { name: "送出查詢" })).toBeEnabled();
  await page.getByRole("button", { name: "送出查詢" }).click();

  await page.waitForURL((url) => url.pathname !== "/erp/new" && /^\/erp\/[^/]+$/.test(url.pathname));
  await expect(page.getByRole("heading", { name: "上季各產品線的毛利率是多少?", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回 ERP 助手首頁" })).toHaveAttribute("href", "/erp");
});
