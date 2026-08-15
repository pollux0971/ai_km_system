import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E07-S020 critical flow: the maintenance history route
 * (/maintenance/history). A cross-case, read-only view over
 * listMaintenanceCases() enriched per-case with getDiagnosticSessionForCase()
 * — both already-existing functions, no new lib/contract — same
 * "component composes two already-existing lib calls" precedent
 * maintenance-session.tsx (E07-S006) already established for combining
 * getMaintenanceCase with getDiagnosticSessionForCase.
 *
 * No dedicated negative-authorization test here — same reasoning
 * maintenance-home.spec.ts's own doc comment already gives for
 * /maintenance itself: role-guard.test.tsx already covers the generic
 * FORBIDDEN-vs-children branching, and nav-items.ts's prefix-matching
 * (rolesRequiredFor, extended by E07-S006 specifically so every
 * /maintenance/* sub-route inherits the same restriction without its own
 * NAV_ITEMS entry) is exercised generically elsewhere — a third
 * per-sub-route repetition of the same already-proven mechanism would be
 * redundant, not additional coverage.
 *
 * No test for "a case with no diagnostic session yet shows no status
 * line" — every case reachable through this app's own real create-case
 * flow (see createCase() below) is redirected straight into
 * /maintenance/[id]/session, whose own mount effect immediately creates a
 * session (see maintenance-session.tsx's own doc comment) — so that
 * specific sub-state has no reachable in-app path to exercise at the E2E
 * layer. It's still covered where it belongs: at the component level, in
 * maintenance-history-list.test.tsx's own directly-mocked unit test.
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

  const caseId = new URL(page.url()).pathname.split("/")[2];
  if (!caseId) throw new Error("expected a case id segment in the session URL");
  return caseId;
}

async function goToHistoryViaHomeLink(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "返回維修助手首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await page.getByRole("link", { name: "查看維修歷史" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/history");
}

test("E07-S020: a freshly created case shows up in 維修歷史 with its 待處理 (OPEN) status", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await goToHistoryViaHomeLink(page);

  await expect(page.getByText("空壓機 A")).toBeVisible();
  await expect(page.getByText("狀態:待處理")).toBeVisible();
});

test("E07-S020: escalating a case and then viewing 維修歷史 shows 已升級 and the recorded reason", async ({ page }) => {
  await createCase(page, "空壓機 A");
  await page.getByLabel("升級原因").fill("現場情況超出可自行處理範圍");
  await page.getByRole("button", { name: "升級此案例" }).click();
  await expect(page.getByText("已升級", { exact: true })).toBeVisible();

  await goToHistoryViaHomeLink(page);

  await expect(page.getByText("狀態:已升級")).toBeVisible();
  await expect(page.getByText("現場情況超出可自行處理範圍")).toBeVisible();
});

test("E07-S020: resolving a case and then viewing 維修歷史 shows 已解決 and the recorded summary", async ({ page }) => {
  await createCase(page, "空壓機 A");
  await page.getByLabel("解決摘要").fill("已更換零件並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();
  await expect(page.getByText("已解決", { exact: true })).toBeVisible();

  await goToHistoryViaHomeLink(page);

  await expect(page.getByText("狀態:已解決")).toBeVisible();
  await expect(page.getByText("已更換零件並確認設備恢復正常運作")).toBeVisible();
});
