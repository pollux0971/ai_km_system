import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E07-S006 critical flow: the diagnostic session shell at
 * /maintenance/[id]/session. maintenance-home.spec.ts's own S002/S003/S005
 * tests already exercise the create-case flow's redirect landing here (see
 * that file's own submitAndReturnToList() doc comment); this file is about
 * the session shell page itself — status display, the resume-not-duplicate
 * guarantee createDiagnosticSession/getDiagnosticSessionForCase's own doc
 * comments describe, and (unlike E07-S001's own doc comment, which explains
 * why a negative-authorization test there was infeasible) a real negative-
 * authorization test, now feasible for exactly the reason the second test
 * below establishes.
 *
 * Navigation after login always uses in-app link clicks, never page.goto()
 * — see conversations.spec.ts's own file doc comment for why (the mock
 * AuthClient's session is a plain in-memory closure with no cookie/storage
 * backing; a hard reload wipes it, full stop — even a login that just
 * succeeded moments earlier doesn't survive a *subsequent* page.goto(),
 * since that's a fresh page load with a brand new empty JS module
 * instance). The one exception: sessionStorage itself (unlike the auth
 * session) is real per-tab browser storage that survives a hard reload —
 * so the second and third tests below deliberately go straight at a known
 * session URL with page.goto() (losing the session on purpose) and ride
 * the exact returnUrl round trip session-gate.spec.ts's own "full round
 * trip" test already proves general-purpose (redirected to /login with a
 * matching returnUrl, then routed straight back after logging in again) to
 * reach it — a genuinely fresh mount, not a client-side transition Next's
 * own router cache might short-circuit without re-running anything.
 * sessionStorage's own survival through all of this is what lets the
 * diagnostic session created in the second test still be there to resume.
 *
 * This same round trip is what makes the third test's negative-
 * authorization check possible at all: unlike /maintenance itself (no
 * sidebar link a general_user can click, and no way to land on it
 * authenticated-as-the-wrong-role to see RoleGuard actually deny), logging
 * in as a *different* role partway through the round trip lands that role
 * on the deep-linked route while genuinely authenticated — the one gap
 * E07-S001's own doc comment identified as untestable at the time.
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

function countStoredSessions(page: import("@playwright/test").Page, caseId: string) {
  return page.evaluate((id) => {
    const raw = window.sessionStorage.getItem("ai-km:mock-diagnostic-sessions");
    const sessions = raw ? (JSON.parse(raw) as { maintenanceCaseId: string }[]) : [];
    return sessions.filter((session) => session.maintenanceCaseId === id).length;
  }, caseId);
}

test("E07-S006: creating a case opens its diagnostic session showing the case title and 待處理 (OPEN) status", async ({
  page,
}) => {
  const caseId = await createCase(page, "3 號生產線包裝機");

  await expect(page.getByRole("heading", { name: "3 號生產線包裝機", level: 1 })).toBeVisible();
  await expect(page.getByText("待處理")).toBeVisible();
  await expect(page.getByText("尚未有診斷步驟。")).toBeVisible();
  expect(await countStoredSessions(page, caseId)).toBe(1);
});

test("E07-S006: revisiting an already-created session resumes it instead of creating a second one", async ({ page }) => {
  const caseId = await createCase(page, "空壓機 A");
  expect(await countStoredSessions(page, caseId)).toBe(1);

  const sessionPath = `/maintenance/${caseId}/session`;
  await page.goto(sessionPath);
  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("returnUrl")).toBe(sessionPath);

  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === sessionPath);

  await expect(page.getByText("待處理")).toBeVisible();
  expect(await countStoredSessions(page, caseId)).toBe(1);
});

test("E07-S006 Security AC: a general_user reaching a maintenance session URL directly is denied, never shown case content", async ({
  page,
}) => {
  // case-sample-1 is E07-S001's own seed data — always present, no prior
  // case-creation step needed.
  const sessionPath = "/maintenance/case-sample-1/session";
  await page.goto(sessionPath);
  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("returnUrl")).toBe(sessionPath);

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === sessionPath);

  // Scoped via `main` — an unscoped getByRole("alert") also matches
  // Next.js's own route announcer (#__next-route-announcer__, also
  // role="alert"), same collision knowledge-ui-e2e.spec.ts's own fix
  // already documents.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("您沒有權限執行此操作。");
  await expect(page.getByText("待處理")).not.toBeVisible();
});
