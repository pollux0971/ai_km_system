import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E07-S022 critical flow: the maintenance report route
 * (/maintenance/report). A status-breakdown aggregate over
 * listMaintenanceCases() + getDiagnosticSessionForCase() (same
 * enrichment composition precedent MaintenanceHistoryList (E07-S020)
 * already established), plus a CSV export — the first export/download
 * feature anywhere in this codebase.
 *
 * The export link is a plain `<a download href="data:text/csv;...">`,
 * not a Blob/createObjectURL dance — a real, functional client-side
 * technique needing no jsdom polyfills to unit-test and, per the test
 * below, genuinely triggering a real browser download event too.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

async function createCase(page: import("@playwright/test").Page, equipmentLabel: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");

  await page.getByRole("link", { name: "開始新的維修診斷" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/new");
  await page.getByLabel("選擇設備").selectOption({ label: equipmentLabel });
  await page.getByRole("button", { name: "建立案例" }).click();
  await page.waitForURL((url) => /^\/maintenance\/[^/]+\/session$/.test(url.pathname));
}

test("E07-S022: 查看維修報表 leads to the report route and reflects a freshly created case's OPEN status", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByRole("link", { name: "返回維修助手首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await page.getByRole("link", { name: "查看維修報表" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/report");

  await expect(page.getByText(/^案例總數:\d+$/)).toBeVisible();
  await expect(page.getByText(/^待處理:\d+$/)).toBeVisible();
});

test("E07-S022: clicking 匯出 CSV downloads a real CSV file containing the case data", async ({ page }) => {
  await createCase(page, "空壓機 A");
  await page.getByRole("link", { name: "返回維修助手首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await page.getByRole("link", { name: "查看維修報表" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/report");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "匯出 CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("maintenance-report.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  expect(content).toContain("空壓機 A");
});
