import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK_MAINTENANCE_USERNAME, MOCK_SALES_USERNAME, MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S025 Functional AC2: axe on the six pages this story restyled
 * (knowledge list, knowledge documents, maintenance home, ERP home, ERP
 * detail with its M3 data table, profile, login). Same
 * `impact === "serious" || "critical"` threshold app-shell-m3.spec.ts
 * (E01-S023) already established — that story's own AC5 test is the
 * precedent this one follows.
 */

async function login(page: import("@playwright/test").Page, username = MOCK_VALID_USERNAME) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(username);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function assertNoSeriousOrCriticalViolations(page: import("@playwright/test").Page, include?: string) {
  const builder = new AxeBuilder({ page });
  const results = await (include ? builder.include(include) : builder).analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
}

test("E01-S025: knowledge list (outlined card grid) has no serious/critical axe violations", async ({ page }) => {
  await login(page);
  await page.goto("/knowledge");
  await expect(page.locator(".m3-card-grid")).toBeVisible();
  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: knowledge documents (list tiles + assist chips) has no serious/critical axe violations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/knowledge/kb-sample-1/documents");
  await expect(page.locator(".m3-list").first()).toBeVisible();

  // Produce a 已封存 assist chip so its own color/contrast is actually
  // under test, not just the unstyled default row.
  const firstItem = page.locator(".m3-list-item").first();
  await firstItem.getByRole("button", { name: "封存文件" }).click();
  await page.getByRole("button", { name: "已封存文件" }).click();
  await expect(page.locator(".m3-assist-chip--status").first()).toBeVisible();

  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: maintenance home (list tiles) has no serious/critical axe violations", async ({ page }) => {
  await login(page, MOCK_MAINTENANCE_USERNAME);
  await page.goto("/maintenance");
  await expect(page.locator(".m3-list").first()).toBeVisible();
  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: ERP home (list tiles) has no serious/critical axe violations", async ({ page }) => {
  await login(page, MOCK_SALES_USERNAME);
  await page.goto("/erp");
  await expect(page.locator(".m3-list").first()).toBeVisible();
  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: ERP detail (M3 data table) has no serious/critical axe violations", async ({ page }) => {
  await login(page, MOCK_SALES_USERNAME);
  await page.goto("/erp/erp-query-sample-1");
  await page.getByRole("button", { name: "各分公司營收" }).click();
  await page.getByRole("button", { name: "確認執行查詢" }).click();
  await expect(page.getByText("查詢已執行完成。")).toBeVisible();
  await expect(page.locator(".m3-table-wrapper table")).toBeVisible();

  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: profile (M3 key/value list) has no serious/critical axe violations", async ({ page }) => {
  await login(page);
  await page.goto("/profile");
  await expect(page.locator(".m3-kv-list")).toBeVisible();
  await assertNoSeriousOrCriticalViolations(page);
});

test("E01-S025: login (outlined SSO button) has no serious/critical axe violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "使用 SSO 登入" })).toBeVisible();
  await assertNoSeriousOrCriticalViolations(page);
});
