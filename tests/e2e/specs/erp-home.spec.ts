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

  // E09-S003 "Query scenario selector" — this question doesn't match any
  // whitelisted scenario's keywords, so every scenario is offered as a
  // fallback option (matchErpScenarios' own "never an empty list"
  // guarantee — see erp-scenarios.test.ts). Picking one records it and
  // replaces the picker with the selected label, same
  // pick-once-then-show-the-result shape as the diagnostic session's own
  // decision-option flow.
  //
  // E09-S004 "Clarification UI" — this same no-match case is exactly the
  // one isAmbiguousErpQuery() flags, so the distinct clarification
  // wording (not the plain S003 prompt) is what's actually shown here.
  await expect(page.getByText(/無法確定您的問題屬於哪個查詢情境/)).toBeVisible();
  await expect(page.getByRole("button", { name: "各分公司營收" })).toBeVisible();
  await page.getByRole("button", { name: "各分公司營收" }).click();
  await expect(page.getByText("查詢情境:各分公司營收")).toBeVisible();
  // The picker's own scenario buttons are gone — not "zero buttons of any
  // kind": E09-S005 "Query confirmation UI" legitimately adds its own,
  // differently-purposed 確認執行查詢 button at exactly this point.
  for (const scenarioLabel of ["各分公司營收", "低庫存品項", "逾期應收帳款", "採購單狀態"]) {
    await expect(page.getByRole("button", { name: scenarioLabel })).toHaveCount(0);
  }

  // E09-S005 "Query confirmation UI" — a separate explicit confirm step
  // sits between scenario selection and execution.
  //
  // E09-S006 "Query loading state" — confirming immediately (no extra
  // click) starts execution: the confirmed-but-not-yet-executing state
  // is transient, not a resting one a user would ever actually see held
  // still, so this no longer asserts the old static "準備執行" message
  // (S005's own original wording) — it asserts the real, observable
  // sequence that message was always a placeholder for: 執行中… while
  // the simulated execution runs, then 查詢已執行完成。 once it settles.
  await page.getByRole("button", { name: "確認執行查詢" }).click();
  await expect(page.getByText("執行中…")).toBeVisible();
  await expect(page.getByText("查詢已執行完成。")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

  // E09-S007 "Text summary" — additive: the existing 查詢已執行完成 status
  // line stays exactly as S006 left it, alongside the scenario's own
  // canned result summary (各分公司營收 was the scenario selected above).
  await expect(
    page.getByText("本次查詢共涵蓋 3 個分公司,總營收為 NT$ 12,450,000,較上期成長 8%。"),
  ).toBeVisible();

  // E09-S008 "Result table" — additive again, next to S007's own summary:
  // the scenario's own mock table, no pagination yet (E09-S009's own
  // separate story).
  await expect(page.getByRole("table")).toBeVisible();
  for (const column of ["分公司", "營收金額", "較上期成長"]) {
    await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
  }
  for (const cell of ["台北", "NT$ 5,200,000", "台中", "高雄"]) {
    await expect(page.getByRole("cell", { name: cell })).toBeVisible();
  }
});
