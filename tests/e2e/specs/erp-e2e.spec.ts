import { test, expect } from "@playwright/test";
import { MOCK_SALES_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E01-S031: test 1 below used to lose the mock AuthClient's in-memory-only
 * session on its own page.reload() (a hard reload always did), which is
 * what forced a reauthenticate() round trip back through login that used
 * to follow it. E03-S035's real cookie session correctly survives a real
 * reload, so that round trip no longer happens — the reload alone now
 * already proves the ERP data survived a genuinely fresh page load,
 * without conflating it with whether the login mechanism also survived
 * (a separate concern session-gate.spec.ts's own tests already cover).
 * See that test's own inline comment, right after its page.reload() call,
 * for the updated reasoning; the reauthenticate() helper this file used
 * to share with maintenance-e2e.spec.ts's pattern was removed since
 * nothing here needs it anymore.
 */

/**
 * E09-S024 — the final story of E09 (AI ERP & Reporting Experience).
 * SOURCE_BASELINE/epic 檔對這個 story 沒有任何專屬內容,只有通用樣板
 * 文字 + 標題,同 E03-S033/E05-S031/E07-S025 這三個既有前例——每個 epic
 * 收尾的 E2E story 都是純測試、零原始碼變更,稽核既有 spec 找出「單獨
 * 驗證過,但從未一起組合驗證過」的落差,而不是重測已經驗證過的東西。
 *
 * 稽核 erp-home.spec.ts(E09 目前唯一的 E2E spec,橫跨 S001-S023)後
 * 找到的具體落差:
 *
 * 1. 兩個既有測試都只從 /erp/new 建立全新查詢——從未真的點擊過首頁
 *    列表裡既有的種子查詢連結進入其詳情頁(S001 只驗證過連結的 href
 *    屬性,從未真的點擊)。
 * 2. 更關鍵的是:種子查詢 erp-query-sample-1 的問題文字「上個月各分
 *    公司的營收總額是多少?」實際上會 confidently 命中 revenue-by-branch
 *    (含「營收」「分公司」關鍵字)——查證 erp-scenarios.ts 的
 *    matchErpScenarios/isAmbiguousErpQuery 原始碼確認:當有真實命中時
 *    只回傳「那一個」情境,不是全部 4 個。既有測試 2 刻意用一個「無法
 *    比對」的問題文字來測 S004 的澄清 UI 與 S003 的「永不清空」
 *    fallback,這代表「只有一個確定命中選項的挑選器」這個路徑——S003/
 *    S004 兩個 story 真正主要要處理的情境——從未被任何 E2E 測試真正
 *    走過,只有 unit test 驗證過。
 * 3. 沒有任何既有測試呼叫過 page.reload() 或等效的真實硬重整。
 * 4. 沒有任何既有測試在同一個 session 裡建立/查看超過一筆 ERP
 *    查詢——無法證明歷史列表在新增一筆之後正確反映(3→4 筆),也
 *    無法證明查看某一筆查詢的詳情頁時,不會被同一個 session 稍早
 *    查看過的另一筆查詢的狀態污染。
 *
 * 兩個測試,同 E03-S033/E05-S031/E07-S025 的既有形狀:「從既有歷史
 * 點進去、confident-match 挑選器、完整跑完、撐過真實重整」+「建立
 * 第二筆查詢後,歷史列表正確反映兩筆,而且各自狀態互不污染」。
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

test("E09-S024: clicking into a seeded query with a confident scenario match shows the single-option picker (not the 4-option ambiguous fallback), completes execution, and survives a real page reload", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "ERP 助手" }).click();
  await page.waitForURL((url) => url.pathname === "/erp");

  const list = page.getByRole("main").getByRole("list");
  await list.getByRole("link", { name: /上個月各分公司的營收總額是多少/ }).click();
  await page.waitForURL((url) => url.pathname === "/erp/erp-query-sample-1");

  // The confident-match prompt ("請選擇最符合您問題的查詢情境:"), not
  // S004's ambiguous-clarification wording — and exactly ONE scenario
  // button, not all 4. This is the path erp-home.spec.ts's own test 2
  // deliberately avoids (it uses a question with zero real keyword
  // matches specifically to exercise the opposite, fallback case).
  await expect(page.getByText("請選擇最符合您問題的查詢情境:")).toBeVisible();
  await expect(page.getByText(/無法確定您的問題屬於哪個查詢情境/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "各分公司營收" })).toBeVisible();
  for (const otherScenario of ["低庫存品項", "逾期應收帳款", "採購單狀態"]) {
    await expect(page.getByRole("button", { name: otherScenario })).toHaveCount(0);
  }

  await page.getByRole("button", { name: "各分公司營收" }).click();
  await expect(page.getByText("查詢情境:各分公司營收")).toBeVisible();

  // A real (non-manual) match, unlike erp-home.spec.ts's own test 2 —
  // the applied-filter line should credit the actual matched keywords
  // ("營收"/"分公司", both present in this question), not claim
  // "no keyword, manually chosen".
  await expect(page.getByText("已套用篩選：營收、分公司")).toBeVisible();

  await page.getByRole("button", { name: "確認執行查詢" }).click();
  await expect(page.getByText("執行中…")).toBeVisible();
  await expect(page.getByText("查詢已執行完成。")).toBeVisible();

  const kpiCard = page.getByRole("group", { name: "關鍵指標" });
  await expect(kpiCard.getByText("3", { exact: true })).toBeVisible();

  // Real hard reload — never exercised anywhere else in this epic's E2E
  // coverage. The mock ERP query data persists to sessionStorage (same
  // pattern every other domain in this codebase uses), so the executed
  // state, not the pre-execution picker, must be what comes back.
  // E01-S031: this used to also lose the separate, in-memory-only mock
  // auth session and need a reauthenticate() round trip back through
  // login — E03-S035's real cookie session correctly survives a real
  // reload now, so the assertion below runs straight after the reload,
  // on the same URL, still authenticated; asserting the URL didn't move
  // makes that explicit instead of leaving it implicit.
  const detailUrl = page.url();
  await page.reload();
  expect(page.url()).toBe(detailUrl);
  await expect(page.getByRole("heading", { name: "上個月各分公司的營收總額是多少?", level: 1 })).toBeVisible();
  await expect(page.getByText("查詢情境:各分公司營收")).toBeVisible();
  await expect(page.getByText("查詢已執行完成。")).toBeVisible();
  await expect(page.getByRole("group", { name: "關鍵指標" }).getByText("3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "確認執行查詢" })).toHaveCount(0);
});

test("E09-S024: creating a second query grows the history list to 4 without disturbing the seeded 3, and each query keeps its own independent state", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "ERP 助手" }).click();
  await page.waitForURL((url) => url.pathname === "/erp");

  await page.getByRole("link", { name: "開始新的 ERP 查詢" }).click();
  await page.waitForURL((url) => url.pathname === "/erp/new");
  await page.getByLabel("輸入您的問題").fill("目前哪些倉庫的品項庫存不足?");
  await page.getByRole("button", { name: "送出查詢" }).click();
  await page.waitForURL((url) => url.pathname !== "/erp/new" && /^\/erp\/[^/]+$/.test(url.pathname));

  // Confident match again (「庫存」), same non-ambiguous path as test 1
  // above but for a different scenario — coverage diversity, not a
  // repeat of the same single case.
  await expect(page.getByText("請選擇最符合您問題的查詢情境:")).toBeVisible();
  await page.getByRole("button", { name: "低庫存品項" }).click();
  await page.getByRole("button", { name: "確認執行查詢" }).click();
  await expect(page.getByText("查詢已執行完成。")).toBeVisible();
  await expect(page.getByText("共發現 5 項庫存低於安全存量的品項,建議儘快補貨。")).toBeVisible();

  await page.getByRole("link", { name: "返回 ERP 助手首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/erp");

  // History grew from 3 to 4 — the original 3 seeded questions are all
  // still present (not replaced), and the brand-new one now sits
  // alongside them.
  const list = page.getByRole("main").getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(4);
  for (const text of [
    "上個月各分公司的營收總額是多少?",
    "目前庫存低於安全存量的品項有哪些?",
    "本季應收帳款逾期客戶清單",
    "目前哪些倉庫的品項庫存不足?",
  ]) {
    await expect(list.getByText(text)).toBeVisible();
  }

  // Visiting a DIFFERENT seeded query afterward shows its own,
  // untouched initial state — not bleeding over the confirmed/executed
  // 低庫存品項 state from the query just created in this same session.
  await list.getByRole("link", { name: /本季應收帳款逾期客戶清單/ }).click();
  await page.waitForURL((url) => url.pathname === "/erp/erp-query-sample-3");

  await expect(page.getByText("請選擇最符合您問題的查詢情境:")).toBeVisible();
  await expect(page.getByRole("button", { name: "逾期應收帳款" })).toBeVisible();
  await expect(page.getByRole("button", { name: "確認執行查詢" })).toHaveCount(0);
  await expect(page.getByText("查詢已執行完成。")).toHaveCount(0);
});
