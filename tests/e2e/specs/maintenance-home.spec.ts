import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E07-S001 critical flow: the maintenance home route. First story of E07
 * (Maintenance Assistant Experience) — nav-items.ts's "/maintenance"
 * entry already existed (added by E01-S006/S009 as an anticipated entry
 * point, role-gated to maintenance_engineer/super_administrator), so
 * this is the first time the route it points to actually renders
 * anything instead of 404ing (see route-guards.spec.ts's own updated
 * doc comment for the E2E-level consequence of that transition).
 *
 * No general_user negative-authorization test here, despite this being
 * the first real page at this route — attempted and reverted during
 * DEV. A general_user has no visible "維修助手" link to click (confirmed
 * by app-shell.spec.ts's own test), and a direct page.goto("/maintenance")
 * cannot reach RoleGuard's FORBIDDEN render either: the mock AuthClient's
 * session is an in-memory closure with no cookie/storage backing (see
 * conversations.spec.ts's own doc comment), so a page.goto() hard reload
 * wipes it and SessionGate correctly redirects to /login before RoleGuard
 * ever runs — exactly the same "no legitimate in-app path, and
 * page.goto() tests the wrong thing" situation citation-open-source.spec.ts's
 * own doc comment already documents for /citations/[id]'s NOT_FOUND case.
 * The actual FORBIDDEN-vs-children branching for this exact route is
 * already covered at the component level by role-guard.test.tsx
 * ("shows a 403 message instead of children on a role-restricted route
 * when the user lacks the role", asserted directly against
 * `renderGuardAs(["general_user"], "/maintenance")").
 *
 * E07-S002 "Equipment selector" adds the second test below — the
 * "開始新的維修診斷" entry link this story's own doc comment above
 * originally noted as deliberately absent, now built, plus the create
 * flow it leads to.
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

test("E07-S001: maintenance home shows the seeded maintenance cases to a maintenance_engineer", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");

  await expect(page.getByRole("heading", { name: "維修助手", level: 1 })).toBeVisible();
  await expect(page.getByText("生產線 3 號機台異音診斷")).toBeVisible();
  await expect(page.getByText("包裝機感測器故障排除")).toBeVisible();
  await expect(page.getByText("空壓機無法啟動")).toBeVisible();

  // The one entry link E07-S002 added — but still no per-case links.
  // E07-S021 "Case detail" owns the not-yet-built /maintenance/[id]
  // route (see maintenance-case-list.tsx's own doc comment for why
  // linking each item now would be premature). Scoped via `main` — an
  // unscoped getByRole("list") also matches the sidebar's own nav <ul>
  // (首頁/對話/知識庫/維修助手, 4 links), which isn't what this is about.
  await expect(page.getByRole("link", { name: "開始新的維修診斷" })).toHaveAttribute("href", "/maintenance/new");
  await expect(page.getByRole("main").getByRole("list").getByRole("link")).toHaveCount(0);
});

test("E07-S002: creating a maintenance case for a chosen equipment adds it to the home list", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");

  await page.getByRole("link", { name: "開始新的維修診斷" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/new");

  await expect(page.getByRole("button", { name: "建立案例" })).toBeDisabled();
  await page.getByLabel("選擇設備").selectOption({ label: "空壓機 A" });
  await expect(page.getByRole("button", { name: "建立案例" })).toBeEnabled();
  await page.getByLabel("設備序號(選填)").fill("SN-2026-0042");
  await page.getByRole("button", { name: "建立案例" }).click();

  await page.waitForURL((url) => url.pathname === "/maintenance");
  await expect(page.getByText("空壓機 A")).toBeVisible();
  await expect(page.getByText("序號:SN-2026-0042")).toBeVisible();
});

test("E07-S003: a maintenance case can still be created with equipment alone, leaving no serial number line", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");

  await page.getByRole("link", { name: "開始新的維修診斷" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/new");

  await page.getByLabel("選擇設備").selectOption({ label: "傳送帶馬達" });
  await page.getByRole("button", { name: "建立案例" }).click();

  await page.waitForURL((url) => url.pathname === "/maintenance");
  const newCaseItem = page.getByText("傳送帶馬達").locator("..");
  await expect(newCaseItem.getByText(/^序號:/)).toHaveCount(0);
});
