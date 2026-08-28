import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USER_ID, MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E07-S021 critical flow: the case detail route (/maintenance/[id]).
 * Read-only summary combining getMaintenanceCase (S001) +
 * getDiagnosticSessionForCase (S006) — same two-fetch composition
 * precedent maintenance-session.tsx already established, fail-closed on
 * both (see case-detail.tsx's own doc comment for why this follows that
 * file's own precedent rather than KnowledgeDetail's "degrade
 * independently" one).
 *
 * Deliberately NOT linked from MaintenanceCaseList (S001) or
 * MaintenanceHistoryList (S020) in this story — both components' own
 * existing, already-approved "renders no links" tests assert exactly
 * zero links, and STORY_WORKFLOW's test-freeze rule's only exception
 * (add interaction steps, keep assertions byte-for-byte unchanged) does
 * not cover flipping an assertion's truth value (0 links -> 1 link).
 * See docs/stories/E07-S021.md's own Assumptions section for the full
 * reasoning and the deliberate choice to self-adopt the conservative
 * option rather than stretch that exception. So this route is reached
 * here the same way maintenance-session.spec.ts's own tests reach a
 * deep-linked session URL: create a case while logged in, note its id,
 * log out explicitly, then page.goto() directly to it and ride the same
 * returnUrl round trip session-gate.spec.ts's own "full round trip" test
 * already proves general-purpose.
 *
 * E01-S031: the explicit logout() step above didn't exist originally —
 * a bare page.goto() used to be enough, because the mock AuthClient's
 * session was a plain in-memory closure that any hard navigation lost
 * outright. E03-S035 replaced that with a real cookie session that
 * correctly survives a hard reload/goto, so reaching this page
 * unauthenticated now takes a deliberate logout() first; the returnUrl
 * round trip itself, and everything each test below actually asserts
 * about the destination page, is unchanged.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

// E01-S031: E03-S035's real cookie session survives a hard reload/goto,
// so an explicit logout is now the only way to reach a deep link below
// while genuinely unauthenticated (see this file's own doc comment).
async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: MOCK_MAINTENANCE_USER_ID }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
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

test("E07-S021: deep-linking to a case's detail page round-trips through login and shows its equipment and OPEN status", async ({
  page,
}) => {
  const caseId = await createCase(page, "空壓機 A");

  await logout(page);
  await page.goto(`/maintenance/${caseId}`);
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/maintenance/${caseId}`);

  await expect(page.getByRole("heading", { name: "空壓機 A", level: 1 })).toBeVisible();
  await expect(page.getByText("設備:空壓機 A")).toBeVisible();
  await expect(page.getByText("狀態:待處理")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看診斷內容" })).toHaveAttribute("href", `/maintenance/${caseId}/session`);
});

test("E07-S021: resolving a case and then deep-linking to its detail page shows 已解決 and the recorded summary", async ({
  page,
}) => {
  const caseId = await createCase(page, "空壓機 A");
  await page.getByLabel("解決摘要").fill("已更換零件並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();
  await expect(page.getByText("已解決", { exact: true })).toBeVisible();

  await logout(page);
  await page.goto(`/maintenance/${caseId}`);
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/maintenance/${caseId}`);

  await expect(page.getByText("狀態:已解決")).toBeVisible();
  await expect(page.getByText("摘要:已更換零件並確認設備恢復正常運作")).toBeVisible();
});

test("E07-S021: deep-linking to an unknown case id shows a distinct not-found state", async ({ page }) => {
  // E03-S035's real cookie session survives a hard reload/goto (unlike
  // the old mock AuthClient's in-memory session), so reaching this page
  // unauthenticated now needs an explicit logout() first (same reasoning
  // every other deep-link test in this file already relies on), not a
  // bare page.goto() alone.
  await login(page);
  await logout(page);
  await page.goto("/maintenance/not-a-real-case-id");
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/not-a-real-case-id");

  await expect(page.getByText("找不到您要的內容。")).toBeVisible();
});
