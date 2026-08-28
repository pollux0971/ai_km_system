import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USER_ID, MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E07-S025 "maintenance E2E" — the closing story for E07, same role
 * E03-S033 played for E03 and E05-S031 played for E05: a pure test-only
 * story (zero source changes) auditing the existing 5 maintenance-domain
 * E2E spec files (case-detail.spec.ts, maintenance-history.spec.ts,
 * maintenance-home.spec.ts, maintenance-report.spec.ts, maintenance-
 * session.spec.ts — 21 tests total across S001-S024) for
 * genuine COMBINATION-level gaps, not a re-test of anything already
 * covered in isolation. Confirmed by direct audit, not assumption:
 * every existing test creates exactly ONE case and exercises exactly
 * ONE feature/page — detail+photo are never combined with AI 說明/SOP
 * 引用來源 in the same submission; 上一步's own established field-
 * clearing (goToPreviousStep clears lastFreeTextDetail/
 * lastPhotoFileName, not just currentStepIndex) is asserted only at the
 * unit level, never confirmed end-to-end alongside a genuine photo
 * upload; case-detail/history/report never see more than one actively-
 * manipulated case at
 * once, so nothing proves they stay mutually consistent when several
 * cases are in different states simultaneously; 重新開始's reset is
 * only ever checked on the session page itself, never confirmed to
 * propagate to case-detail/history, which read the same underlying
 * session independently; and no existing test does an explicit
 * `page.reload()`.
 *
 * Two tests, mirroring E03-S033/E05-S031's own "everything succeeds
 * together" / "an action's effect stays correctly scoped" shape:
 *
 * 1. One case walked through a genuinely rich flow (safety
 *    acknowledgment, option + detail + photo in one submission, AI
 *    說明 and SOP 引用來源 both opened, 上一步 confirmed to clear that
 *    submission's own recorded detail/photo and require re-
 *    acknowledgment, a second real submission, resolve, knowledge
 *    candidate submission) alongside a second, untouched case — then
 *    every downstream view (case detail via a real reload, history,
 *    report, the home page's resume prompt) is checked TOGETHER to
 *    confirm they all agree on both cases' correct, distinct states.
 * 2. 重新開始 on an escalated case (with recorded detail/photo already
 *    on it) resets not just the session page itself but every other
 *    view reading the same session — case detail and history both
 *    re-fetch fresh, they don't cache or infer the pre-reset state.
 *    Also proves case-detail's own 查看診斷內容 link genuinely
 *    round-trips back to the live session (only its href was ever
 *    checked before, never actually clicked).
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

async function reauthenticate(page: import("@playwright/test").Page, expectedPathname: string) {
  await page.waitForURL((url) => url.pathname === "/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === expectedPathname);
}

// E01-S031: E03-S035's real cookie session survives a hard reload/goto,
// so the page.goto() calls below that used to reach reauthenticate()'s
// /login wait as a side effect now need an explicit logout first.
async function logout(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: MOCK_MAINTENANCE_USER_ID }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
}

test("E07-S025: a case's rich diagnostic history stays consistent across the session page, case detail, history, report, and the resume prompt — including a real reload", async ({
  page,
}) => {
  await login(page);

  // Case A: the rich flow — every capability from S008-S023 combined
  // in one continuous session, something no existing single-feature
  // spec ever does.
  const caseAId = await createCase(page, "空壓機 A");

  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByLabel("補充說明").fill("現場有明顯異音,判斷為軸承磨損");
  await page.getByLabel("附加照片").setInputFiles({
    name: "異音位置.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake photo bytes"),
  });
  await page.getByRole("button", { name: "AI 說明" }).click();
  await page.getByRole("button", { name: "SOP 引用來源" }).click();
  await expect(page.getByRole("button", { name: "收合 AI 說明" })).toBeVisible();
  await expect(page.getByRole("button", { name: "收合 SOP 引用來源" })).toBeVisible();
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  // 上一步 must clear the previous submission's own recorded detail/
  // photo (goToPreviousStep's own established behavior, see
  // diagnostic-sessions.ts) AND require re-acknowledging the safety
  // warning — no existing test combines detail+photo with 上一步 to
  // confirm the clear genuinely reaches these two specific fields, not
  // just currentStepIndex.
  await page.getByRole("button", { name: "上一步" }).click();
  await expect(page.getByRole("heading", { name: "步驟 1", level: 2 })).toBeVisible();
  await expect(page.getByText(/^您的補充說明/)).toHaveCount(0);
  await expect(page.getByText(/^已附加照片/)).toHaveCount(0);
  await expect(page.getByLabel("我已閱讀並了解上述安全警告")).not.toBeChecked();

  // Re-submit — this second, post-back-navigation submission is what
  // the rest of the test's later cross-page assertions rely on.
  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByLabel("補充說明").fill("現場有明顯異音,判斷為軸承磨損");
  await page.getByLabel("附加照片").setInputFiles({
    name: "異音位置.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake photo bytes"),
  });
  await page.getByRole("button", { name: "異常已排除" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  await page.getByLabel("解決摘要").fill("已更換軸承並確認設備恢復正常運作");
  await page.getByRole("button", { name: "解決此案例" }).click();
  await expect(page.getByText("已解決", { exact: true })).toBeVisible();

  await page.getByLabel("候選內容").fill("空壓機異音多半是軸承磨損,更換軸承即可排除。");
  await page.getByRole("button", { name: "提交為知識候選" }).click();
  await expect(page.getByText("已提交知識候選:")).toBeVisible();

  // Case B: left untouched at OPEN, for the multi-case checks below.
  await createCase(page, "傳送帶馬達");

  // Case detail for A, reached via a real hard navigation (page.goto,
  // after an explicit logout — E01-S031: E03-S035's real cookie session
  // survives page.goto on its own, so the logout is what now reaches an
  // unauthenticated state, the same "reload" this story's own doc
  // comment promises) — every recorded field from the rich flow above
  // must show up together, not just the ones any single existing
  // case-detail test already checks in isolation.
  await logout(page);
  await page.goto(`/maintenance/${caseAId}`);
  await reauthenticate(page, `/maintenance/${caseAId}`);
  await expect(page.getByRole("heading", { name: "空壓機 A", level: 1 })).toBeVisible();
  await expect(page.getByText("狀態:已解決")).toBeVisible();
  await expect(page.getByText("補充說明:現場有明顯異音,判斷為軸承磨損")).toBeVisible();
  await expect(page.getByText("附加照片:異音位置.jpg")).toBeVisible();
  await expect(page.getByText("摘要:已更換軸承並確認設備恢復正常運作")).toBeVisible();

  // Back to the home page in-app (no further hard reload needed) —
  // the resume prompt must show ONLY case B (still OPEN), and must NOT
  // still list case A now that it's resolved.
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await expect(page.getByRole("heading", { name: "繼續進行中的診斷" })).toBeVisible();
  await expect(page.getByRole("link", { name: /傳送帶馬達/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /空壓機 A/ })).not.toBeVisible();

  // History must show BOTH cases, each with its own correct, distinct
  // status — every existing history test only ever has one active case
  // in play.
  await page.getByRole("link", { name: "查看維修歷史" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/history");
  await expect(page.getByText("狀態:已解決")).toBeVisible();
  await expect(page.getByText("已更換軸承並確認設備恢復正常運作")).toBeVisible();
  await expect(page.getByText("狀態:待處理")).toBeVisible();

  // Report must count both correctly together, and the export must
  // contain both — every existing report test only ever has one
  // manipulated case.
  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await page.getByRole("link", { name: "查看維修報表" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/report");
  await expect(page.getByText(/^已解決:[1-9]\d*$/)).toBeVisible();
  await expect(page.getByText(/^待處理:[1-9]\d*$/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "匯出 CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  expect(content).toContain("空壓機 A");
  expect(content).toContain("傳送帶馬達");
});

test("E07-S025: 重新開始 resets an escalated case everywhere it's shown, not just on the session page, and 查看診斷內容 genuinely round-trips back", async ({
  page,
}) => {
  await login(page);
  const caseId = await createCase(page, "CNC 加工機 2 號");

  await page.getByLabel("我已閱讀並了解上述安全警告").check();
  await page.getByLabel("補充說明").fill("加工精度持續異常");
  await page.getByLabel("附加照片").setInputFiles({
    name: "公差量測.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake measurement photo"),
  });
  await page.getByRole("button", { name: "異常仍然存在" }).click();
  await expect(page.getByRole("heading", { name: "步驟 2", level: 2 })).toBeVisible();

  await page.getByLabel("升級原因").fill("現場情況超出可自行處理範圍,需要專業支援");
  await page.getByRole("button", { name: "升級此案例" }).click();
  await expect(page.getByText("已升級", { exact: true })).toBeVisible();

  // Confirm case detail shows the escalated state before the reset —
  // establishes the "before" half of the propagation check below.
  // E01-S031: explicit logout() first — see its own doc comment above.
  await logout(page);
  await page.goto(`/maintenance/${caseId}`);
  await reauthenticate(page, `/maintenance/${caseId}`);
  await expect(page.getByText("狀態:已升級")).toBeVisible();
  await expect(page.getByText("原因:現場情況超出可自行處理範圍,需要專業支援")).toBeVisible();

  // 查看診斷內容 has only ever had its href asserted before (S021's own
  // tests never click it) — confirm it's a genuine, working round trip
  // back to the live session, landing on the same escalated state.
  await page.getByRole("link", { name: "查看診斷內容" }).click();
  await page.waitForURL((url) => url.pathname === `/maintenance/${caseId}/session`);
  await expect(page.getByText("已升級此案例,原因:現場情況超出可自行處理範圍,需要專業支援")).toBeVisible();

  await page.getByRole("button", { name: "重新開始" }).click();
  await expect(page.getByText("待處理")).toBeVisible();
  await expect(page.getByText(/^已升級/)).toHaveCount(0);
  await expect(page.getByText(/^您的補充說明/)).toHaveCount(0);
  await expect(page.getByText(/^已附加照片/)).toHaveCount(0);

  // The reset must propagate to every other view reading the same
  // session — case detail and history must NOT show stale escalation
  // data just because they aren't the page the reset happened on.
  // E01-S031: explicit logout() first — see its own doc comment above.
  await logout(page);
  await page.goto(`/maintenance/${caseId}`);
  await reauthenticate(page, `/maintenance/${caseId}`);
  await expect(page.getByText("狀態:待處理")).toBeVisible();
  await expect(page.getByText(/^原因:/)).toHaveCount(0);
  await expect(page.getByText(/^補充說明:/)).toHaveCount(0);
  await expect(page.getByText(/^附加照片:/)).toHaveCount(0);

  await sidebarNav(page).getByRole("link", { name: "維修助手" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance");
  await page.getByRole("link", { name: "查看維修歷史" }).click();
  await page.waitForURL((url) => url.pathname === "/maintenance/history");
  await expect(page.getByText("狀態:待處理")).toBeVisible();
  await expect(page.getByText("現場情況超出可自行處理範圍,需要專業支援")).toHaveCount(0);
});
