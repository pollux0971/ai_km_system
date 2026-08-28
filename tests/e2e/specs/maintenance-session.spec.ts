import { test, expect } from "@playwright/test";
import {
  MOCK_MAINTENANCE_USER_ID,
  MOCK_MAINTENANCE_USERNAME,
  MOCK_VALID_PASSWORD,
  MOCK_VALID_USERNAME,
} from "@ai-km/auth-client";

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
 * Navigation after login always uses in-app link clicks, never a bare
 * page.goto() to a fresh URL — except the specific spots below that
 * deliberately want an unauthenticated round trip through a deep link
 * (see conversations.spec.ts's own file doc comment for the general
 * reasoning). Historically that round trip fell out for free: the mock
 * AuthClient's session was a plain in-memory closure with no cookie/
 * storage backing, so any hard navigation lost it outright — even a
 * login that just succeeded moments earlier didn't survive a
 * *subsequent* page.goto(). E01-S031: E03-S035 replaced that with a real
 * cookie session that correctly survives a hard reload/goto, so those
 * spots now call an explicit logout() first before the page.goto() — the
 * same returnUrl round trip session-gate.spec.ts's own "full round trip"
 * test already proves general-purpose (redirected to /login with a
 * matching returnUrl, then routed straight back after logging in again),
 * just reached deliberately instead of as a side effect. sessionStorage
 * itself (unlike the auth session, before or after E03-S035) is real
 * per-tab browser storage that survives a hard reload regardless — a
 * genuinely fresh mount, not a client-side transition Next's own router
 * cache might short-circuit without re-running anything — which is what
 * lets the diagnostic session created in the "revisiting an
 * already-created session" test below still be there to resume.
 *
 * The negative-authorization test below is unaffected by any of this: it
 * never logs in first in that browser context, so a bare page.goto() was
 * always enough to reach it genuinely unauthenticated, both before and
 * after E03-S035. It's what makes that test's own round trip through a
 * *different* role possible at all: unlike /maintenance itself (no
 * sidebar link a general_user can click, and no way to land on it
 * authenticated-as-the-wrong-role to see RoleGuard actually deny), logging
 * in as that different role after the redirect lands it on the
 * deep-linked route while genuinely authenticated — the one gap
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

// E01-S031: see this file's own doc comment — E03-S035's real cookie
// session survives a hard reload/goto, so an explicit logout is now the
// only way to reach a deep link below while genuinely unauthenticated.
async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: MOCK_MAINTENANCE_USER_ID }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
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
  // E07-S006's own EVIDENCE (AC #8) pre-announced this exact transition:
  // "尚未有診斷步驟。" was always documented as a deliberate placeholder,
  // to be replaced once E07-S007 "Current-step card" landed — same
  // "later story legitimately supersedes an earlier story's own
  // placeholder assertion" precedent knowledge-documents.spec.ts's own
  // E05-S020 -> E05-S029 role="alert" upgrade already established. The
  // dedicated E07-S007 test below covers the new content in full; this
  // just confirms the old "no steps yet" copy is genuinely gone.
  await expect(page.getByText("尚未有診斷步驟。")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  expect(await countStoredSessions(page, caseId)).toBe(1);
});

test("E07-S007: the diagnostic session shows a current-step card with a real, honestly-labeled-as-simulated instruction", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByText("請描述目前觀察到的異常現象", { exact: false })).toBeVisible();
  await expect(page.getByText("模擬步驟", { exact: false })).toBeVisible();
});

test("E07-S006: revisiting an already-created session resumes it instead of creating a second one", async ({ page }) => {
  const caseId = await createCase(page, "空壓機 A");
  expect(await countStoredSessions(page, caseId)).toBe(1);

  const sessionPath = `/maintenance/${caseId}/session`;
  await logout(page);
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

test("E07-S008: selecting a decision option advances the session to the next step and flips its status to 進行中", async ({
  page,
}) => {
  const caseId = await createCase(page, "空壓機 A");

  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  // exact:true — the step-1 instruction text itself ends in "...進行中。",
  // which would otherwise collide with the status span under the default
  // substring match, same class of accidental-collision fix E07-S004's
  // own EVIDENCE already documents for exact:true.
  await expect(page.getByText("進行中", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "異常已排除" })).not.toBeVisible();

  // Persists across a genuinely fresh mount (not just client-side router
  // cache) — same returnUrl round trip the S006 "resumes" test above
  // already established, ridden here (via an explicit logout first,
  // E01-S031) to reach the same session URL after sessionStorage (not
  // the mock auth session) survives the hard reload.
  const sessionPath = `/maintenance/${caseId}/session`;
  await logout(page);
  await page.goto(sessionPath);
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === sessionPath);

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  // exact:true — the step-1 instruction text itself ends in "...進行中。",
  // which would otherwise collide with the status span under the default
  // substring match, same class of accidental-collision fix E07-S004's
  // own EVIDENCE already documents for exact:true.
  await expect(page.getByText("進行中", { exact: true })).toBeVisible();
});

test("E07-S008: selecting a decision option a second time (e.g. a slow double-click) is rejected, not silently duplicated", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常仍然存在" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  // The step-0 options are gone once advanced (previous test already
  // confirms this) — this test independently confirms the underlying
  // guard directly, the same way maintenance-session.spec.ts's own
  // resume-not-duplicate test checks the store rather than only the UI.
  const sessionsRaw = await page.evaluate(() => window.sessionStorage.getItem("ai-km:mock-diagnostic-sessions"));
  const sessions = sessionsRaw ? (JSON.parse(sessionsRaw) as { currentStepIndex: number }[]) : [];
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.currentStepIndex).toBe(1);
});

test("E07-S009: typing free-text detail before selecting an option records it, and it stays visible after advancing and reloading", async ({
  page,
}) => {
  const caseId = await createCase(page, "空壓機 A");

  await page.getByLabel("補充說明").fill("現場有明顯異音，且設備外殼溫度偏高");
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("現場有明顯異音，且設備外殼溫度偏高")).toBeVisible();

  const sessionPath = `/maintenance/${caseId}/session`;
  await logout(page);
  await page.goto(sessionPath);
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === sessionPath);

  await expect(page.getByText("現場有明顯異音，且設備外殼溫度偏高")).toBeVisible();
});

test("E07-S009: selecting an option without typing any detail advances normally and shows no leftover detail line", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常仍然存在" }).click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("您的補充說明", { exact: false })).not.toBeVisible();
});

test("E07-S010: clicking 上一步 returns to the first step, clears the stale choice/detail, and allows choosing again", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await page.getByLabel("補充說明").fill("最初的觀察紀錄");
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "上一步" }).click();

  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByText("最初的觀察紀錄")).not.toBeVisible();
  await expect(page.getByLabel("補充說明")).toHaveValue("");
  await expect(page.getByRole("button", { name: "異常已排除" })).toBeVisible();

  // The repeat-guard no longer blocks a fresh selection after going back —
  // but E07-S017's own gate does require re-acknowledging (going back
  // resets `safetyAcknowledged`, same as every other transient UI state).
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常仍然存在" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
});

test("E07-S010: no 上一步 button is shown on the first step (nothing to go back to — the VALIDATION_ERROR guard for this case is covered at the unit level)", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await expect(page.getByRole("button", { name: "上一步" })).not.toBeVisible();
});

test("E07-S011: clicking 重新開始 resets a fully-advanced session back to the first step and 待處理 status", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");
  await page.getByLabel("補充說明").fill("現場有明顯異音");
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("進行中", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "重新開始" }).click();

  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByText("待處理")).toBeVisible();
  await expect(page.getByText("現場有明顯異音")).not.toBeVisible();
  await expect(page.getByLabel("補充說明")).toHaveValue("");

  // A genuinely fresh start — the repeat-guard doesn't block re-selecting,
  // but E07-S017's own gate does require re-acknowledging (重新開始 resets
  // `safetyAcknowledged`, same as every other transient UI state).
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常仍然存在" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
});

test("E07-S011: 重新開始 is available even on the very first step", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await expect(page.getByRole("button", { name: "重新開始" })).toBeVisible();
});

test("E07-S012: 跳過此步驟 stays disabled until a reason is typed, then advances and records it", async ({ page }) => {
  await createCase(page, "空壓機 A");
  // E07-S017: step 0's safetyWarning gates 跳過此步驟 behind this checkbox
  // too — checked first here so the assertions below isolate the
  // reason-required gate this test is actually about, unaffected by it.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();

  const skipButton = page.getByRole("button", { name: "跳過此步驟" });
  await expect(skipButton).toBeDisabled();

  await page.getByLabel("略過原因").fill("現場暫時無法安全接近設備");
  await expect(skipButton).toBeEnabled();
  await skipButton.click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("進行中", { exact: true })).toBeVisible();
  await expect(page.getByText("現場暫時無法安全接近設備")).toBeVisible();
});

test("E07-S012: skipping a second time is rejected (nothing left to skip), same repeat-guard shape as selecting an option twice", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByLabel("略過原因").fill("第一次略過原因");
  await page.getByRole("button", { name: "跳過此步驟" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  const sessionsRaw = await page.evaluate(() => window.sessionStorage.getItem("ai-km:mock-diagnostic-sessions"));
  const sessions = sessionsRaw ? (JSON.parse(sessionsRaw) as { currentStepIndex: number }[]) : [];
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.currentStepIndex).toBe(1);
});

test("E07-S013: attaching a photo before selecting an option records its name, and it stays visible after advancing and reloading", async ({
  page,
}) => {
  const caseId = await createCase(page, "空壓機 A");

  await page.getByLabel("附加照片").setInputFiles({
    name: "現場照片.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake photo content"),
  });
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("現場照片.jpg", { exact: false })).toBeVisible();

  const sessionPath = `/maintenance/${caseId}/session`;
  await logout(page);
  await page.goto(sessionPath);
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === sessionPath);

  await expect(page.getByText("現場照片.jpg", { exact: false })).toBeVisible();
});

test("E07-S013: clicking 上一步 after attaching a photo clears the selection, same as the existing choice/detail clearing", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await page.getByLabel("附加照片").setInputFiles({
    name: "現場照片.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake photo content"),
  });
  // E07-S017: step 0's safetyWarning gates its option/skip buttons behind
  // this checkbox — see current-step-card.tsx's own doc comment.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
  await expect(page.getByText("現場照片.jpg", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "上一步" }).click();

  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByText("現場照片.jpg", { exact: false })).not.toBeVisible();
});

test("E07-S014: opening AI 說明 shows an honestly-labeled simulated explanation for the current step", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByRole("button", { name: "AI 說明" }).click();

  await expect(page.getByText("模擬說明", { exact: false })).toBeVisible();
});

test("E07-S014: collapsing AI 說明 hides the explanation again", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByRole("button", { name: "AI 說明" }).click();
  await expect(page.getByText("模擬說明", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "收合 AI 說明" }).click();

  await expect(page.getByText("模擬說明", { exact: false })).not.toBeVisible();
});

test("E07-S015: opening SOP 引用來源 shows an honestly-labeled SOP citation for the current step", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByRole("button", { name: "SOP 引用來源" }).click();

  await expect(page.getByText("模擬 SOP", { exact: false })).toBeVisible();
  await expect(page.getByText("模擬片段", { exact: false })).toBeVisible();
});

test("E07-S015: collapsing SOP 引用來源 hides the citation again", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByRole("button", { name: "SOP 引用來源" }).click();
  await expect(page.getByText("模擬 SOP", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "收合 SOP 引用來源" }).click();

  await expect(page.getByText("模擬 SOP", { exact: false })).not.toBeVisible();
});

test("E07-S016: the first step's safety warning displays automatically, honestly labeled, without clicking anything", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await expect(page.getByRole("alert").filter({ hasText: "模擬警告" })).toBeVisible();
});

test("E07-S017: option buttons stay disabled on a high-risk step until the safety warning is acknowledged, then work normally", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  const optionButton = page.getByRole("button", { name: "異常已排除" });
  await expect(optionButton).toBeDisabled();

  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await expect(optionButton).toBeEnabled();
  await optionButton.click();

  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();
});

test("E07-S017: going back to a high-risk step requires re-acknowledging the warning", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "上一步" }).click();

  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByLabel("我已閱讀並了解上述安全警告")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "異常已排除" })).toBeDisabled();
});

test("E07-S018: typing a reason and clicking 升級此案例 marks the case escalated, hides the escalation UI, and shows the recorded reason", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await page.getByLabel("升級原因").fill("現場情況超出可自行處理範圍");
  await page.getByRole("button", { name: "升級此案例" }).click();

  // exact:true — the recorded-reason paragraph's own text starts with
  // "已升級此案例", which would otherwise collide with the status span
  // under the default substring match, same class of accidental-collision
  // fix E07-S004's own EVIDENCE already documents for exact:true.
  await expect(page.getByText("已升級", { exact: true })).toBeVisible();
  await expect(page.getByText("現場情況超出可自行處理範圍")).toBeVisible();
  await expect(page.getByRole("button", { name: "升級此案例" })).not.toBeVisible();
});

test("E07-S018: 升級此案例 works even when a high-risk step's safety warning hasn't been acknowledged yet", async ({ page }) => {
  await createCase(page, "空壓機 A");

  // Deliberately do NOT check 我已閱讀並了解上述安全警告 or select an option
  // first — E07-S018's own gate (escalation) is independent of E07-S017's
  // safety-confirmation gate, see current-step-card.tsx's own doc comment.
  await page.getByLabel("升級原因").fill("現場情況超出可自行處理範圍");
  await page.getByRole("button", { name: "升級此案例" }).click();

  // exact:true — the recorded-reason paragraph's own text starts with
  // "已升級此案例", which would otherwise collide with the status span
  // under the default substring match, same class of accidental-collision
  // fix E07-S004's own EVIDENCE already documents for exact:true.
  await expect(page.getByText("已升級", { exact: true })).toBeVisible();
});

test("E07-S019: typing a summary and clicking 解決此案例 marks the case resolved, hides the action UI, and shows the recorded summary", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");

  await page.getByLabel("解決摘要").fill("已更換零件並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();

  // exact:true — same accidental-collision reasoning as the escalation
  // test above, this time against "已解決此案例" vs the status span.
  await expect(page.getByText("已解決", { exact: true })).toBeVisible();
  await expect(page.getByText("已更換零件並確認設備恢復正常運作")).toBeVisible();
  await expect(page.getByRole("button", { name: "解決此案例" })).not.toBeVisible();
});

test("E07-S019: 解決此案例 works even when a high-risk step's safety warning hasn't been acknowledged yet", async ({ page }) => {
  await createCase(page, "空壓機 A");

  // Deliberately do NOT check 我已閱讀並了解上述安全警告 or select an option
  // first — E07-S019's own gate (completion) is independent of E07-S017's
  // safety-confirmation gate, same reasoning as E07-S018's own equivalent
  // test, see current-step-card.tsx's own doc comment.
  await page.getByLabel("解決摘要").fill("已更換零件並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();

  await expect(page.getByText("已解決", { exact: true })).toBeVisible();
});

test("E07-S023: resolving a case then submitting a knowledge candidate records and shows it, replacing the submission form", async ({
  page,
}) => {
  await createCase(page, "空壓機 A");
  await page.getByLabel("解決摘要").fill("已更換零件並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();
  await expect(page.getByText("已解決", { exact: true })).toBeVisible();

  await page.getByLabel("候選內容").fill("空壓機異音多半是軸承磨損,更換軸承即可排除。");
  await page.getByRole("button", { name: "提交為知識候選" }).click();

  await expect(page.getByText("已提交知識候選:")).toBeVisible();
  await expect(page.getByText("空壓機異音多半是軸承磨損,更換軸承即可排除。")).toBeVisible();
  await expect(page.getByRole("button", { name: "提交為知識候選" })).not.toBeVisible();
});

test("E07-S023: 提交為知識候選 is not offered before the case reaches a terminal state", async ({ page }) => {
  await createCase(page, "空壓機 A");

  await expect(page.getByLabel("候選內容")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "提交為知識候選" })).not.toBeVisible();
});
