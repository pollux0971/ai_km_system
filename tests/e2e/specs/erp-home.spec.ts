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

  await expect(page.getByRole("link", { name: "開始新的 ERP 查詢" })).toHaveAttribute("href", "/erp/new");

  // E09-S015 "Query history" — each seeded item now links to its own
  // /erp/{id} detail page (see erp-query-list.tsx's own updated doc
  // comment; this was the dedicated story every prior S007-S014 story
  // deliberately left this list untouched for). Scoped via the list
  // itself — an unscoped getByRole("list") also matches the sidebar's
  // own nav <ul>, which isn't what this is about.
  const list = page.getByRole("main").getByRole("list");
  await expect(list.getByRole("link", { name: /上個月各分公司的營收總額是多少/ })).toHaveAttribute(
    "href",
    "/erp/erp-query-sample-1",
  );
  await expect(list.getByRole("link", { name: /目前庫存低於安全存量的品項有哪些/ })).toHaveAttribute(
    "href",
    "/erp/erp-query-sample-2",
  );
  await expect(list.getByRole("link", { name: /本季應收帳款逾期客戶清單/ })).toHaveAttribute(
    "href",
    "/erp/erp-query-sample-3",
  );
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

  // E09-S012 "Applied-filter display" — this question ("上季各產品線的
  // 毛利率是多少?") never matched any scenario's own keywords (that's why
  // the clarification picker showed every scenario as a fallback option
  // above), so picking 各分公司營收 here was a manual, no-real-match pick
  // — the honest "no keyword" label, not a fabricated match, is what
  // should show.
  await expect(page.getByText("已套用篩選：無自動偵測關鍵字(使用者手動選擇此情境)")).toBeVisible();

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

  // E09-S013 "Data freshness badge" — additive again: the query's own
  // executedAt timestamp, formatted the same way as the existing
  // createdAt line at the top of the page. The exact time is set at
  // real E2E run time (not a fixed mock), so only the badge's presence
  // and label text are asserted here — not the volatile timestamp
  // value itself.
  await expect(page.getByText("資料更新時間：")).toBeVisible();

  // E09-S014 "Source-system badge" — additive again: a constant, literal
  // string (this MVP has exactly one simulated ERP data source, not a
  // real named product), identical for every scenario.
  await expect(page.getByText("資料來源系統：模擬 ERP 系統(MVP,唯讀)")).toBeVisible();

  // E09-S009 "Server pagination UI" (below) legitimately adds its own
  // 上一頁/下一頁 nav buttons, E09-S016/S017 "Excel export action"/"Export
  // progress" legitimately adds its own 匯出 Excel button, and E09-S018
  // "Prediction scenario selector" legitimately adds its own 3-button
  // "AI 預測" group, at this exact resting state — different kinds of
  // control (browsing an already-complete result; exporting it; exploring
  // a prediction) from what this guards against (no leftover
  // confirm/retry-style button still driving the query process forward).
  // Counted arithmetically (total in main, minus each known-legitimate
  // container's own count) rather than a single combined selector, so a
  // future story adding another legitimately-grouped control extends this
  // the same way instead of growing an ever-longer :not() chain — same
  // narrowing this story's own unit test uses for the equivalent
  // assertion.
  const totalMainButtons = await page.getByRole("main").locator("button").count();
  const paginationNavButtons = await page
    .getByRole("navigation", { name: "查詢結果分頁" })
    .locator("button")
    .count();
  const predictionGroupButtons = await page.getByRole("group", { name: "AI 預測" }).locator("button").count();
  const exportButtons = await page.getByRole("main").getByRole("button", { name: "匯出 Excel" }).count();
  expect(totalMainButtons - paginationNavButtons - predictionGroupButtons - exportButtons).toBe(0);

  // E09-S007 "Text summary" — additive: the existing 查詢已執行完成 status
  // line stays exactly as S006 left it, alongside the scenario's own
  // canned result summary (各分公司營收 was the scenario selected above).
  await expect(
    page.getByText("本次查詢共涵蓋 3 個分公司,總營收為 NT$ 12,450,000,較上期成長 8%。"),
  ).toBeVisible();

  // E09-S010 "KPI card" — additive again: a single derived headline
  // number (the table's own total row count — 3, for this scenario's 3
  // branches), not a hand-typed duplicate.
  const kpiCard = page.getByRole("group", { name: "關鍵指標" });
  await expect(kpiCard).toBeVisible();
  await expect(kpiCard.getByText("「各分公司營收」結果筆數")).toBeVisible();
  await expect(kpiCard.getByText("3", { exact: true })).toBeVisible();

  // E09-S011 "Chart renderer" — additive again: a hand-rolled bar chart,
  // one bar per row. Scoped to the chart's own container — bar
  // labels/details (e.g. 台北) legitimately repeat text the table below
  // also shows, so an unscoped locator would be ambiguous.
  const chart = page.getByRole("group", { name: "結果圖表" });
  await expect(chart).toBeVisible();
  for (const barText of ["台北", "NT$ 5,200,000", "台中", "NT$ 3,850,000", "高雄", "NT$ 3,400,000"]) {
    await expect(chart.getByText(barText, { exact: true })).toBeVisible();
  }

  // E09-S008 "Result table" — additive again, next to S007's own summary:
  // the scenario's own mock table. E09-S009 (below) narrows this initial
  // check to page 1's own cells — the whole table no longer renders
  // unpaginated in one shot.
  await expect(page.getByRole("table")).toBeVisible();
  for (const column of ["分公司", "營收金額", "較上期成長"]) {
    await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
  }
  for (const cell of ["台北", "NT$ 5,200,000", "台中"]) {
    await expect(page.getByRole("cell", { name: cell })).toBeVisible();
  }

  // E09-S009 "Server pagination UI" — a small mock page size (2) means
  // even this 3-row table spans 2 pages, so the capability is genuinely
  // exercised here rather than a control that never actually triggers.
  await expect(page.getByRole("cell", { name: "高雄" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "查詢結果分頁" })).toBeVisible();
  await expect(page.getByText("第 1 頁，共 2 頁")).toBeVisible();
  await expect(page.getByRole("button", { name: "上一頁" })).toBeDisabled();
  await page.getByRole("button", { name: "下一頁" }).click();
  await expect(page.getByRole("cell", { name: "高雄" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "台北" })).toHaveCount(0);
  await expect(page.getByText("第 2 頁，共 2 頁")).toBeVisible();
  await expect(page.getByRole("button", { name: "下一頁" })).toBeDisabled();

  // E09-S016 "Excel export action" — additive again: a real CSV download
  // (Excel-openable; same data: URI technique maintenance-report.spec.ts's
  // own "clicking 匯出 CSV downloads a real CSV file" test (E07-S022)
  // already proves works end-to-end in this exact environment), holding
  // the full result set regardless of which page happens to be on
  // screen — still page 2 here (高雄 visible, 台北 hidden) from the
  // pagination steps just above, yet the download must contain every row.
  //
  // E09-S017 "Export progress" — additive again: clicking now shows a
  // real, visible 匯出中… state (backed by a genuine ~500ms simulated
  // delay, same as this page's own 執行中… state above) before the
  // download fires, instead of downloading immediately.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 Excel" }).click();
  await expect(page.getByText("匯出中…")).toBeVisible();
  const download = await downloadPromise;
  await expect(page.getByRole("button", { name: "匯出 Excel" })).toBeVisible();

  expect(download.suggestedFilename()).toBe("erp-query-result.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  for (const cell of ["台北", "NT$ 5,200,000", "台中", "NT$ 3,850,000", "高雄", "NT$ 3,400,000"]) {
    expect(content).toContain(cell);
  }

  // E09-S018 "Prediction scenario selector" — additive again: a freely
  // switchable toggle group of time horizons for the same
  // already-selected scenario (not a second business-area re-selection —
  // see erp-query-detail.tsx's own doc comment).
  const predictionGroup = page.getByRole("group", { name: "AI 預測" });
  await expect(predictionGroup).toBeVisible();
  for (const horizon of ["下月", "下季", "下年"]) {
    await expect(predictionGroup.getByRole("button", { name: horizon, pressed: false })).toBeVisible();
  }
  await predictionGroup.getByRole("button", { name: "下季" }).click();
  await expect(predictionGroup.getByRole("button", { name: "下季", pressed: true })).toBeVisible();
  await expect(predictionGroup.getByRole("button", { name: "下月", pressed: false })).toBeVisible();

  // E09-S019 "Prediction result" — additive again: a growth-rate
  // statement naming the already-selected scenario and the just-picked
  // horizon, switching when a different horizon is picked.
  await expect(predictionGroup.getByText("預測「各分公司營收」下季將較本期成長約 8%。")).toBeVisible();
  await predictionGroup.getByRole("button", { name: "下年" }).click();
  await expect(predictionGroup.getByText("預測「各分公司營收」下年將較本期成長約 15%。")).toBeVisible();
  await expect(predictionGroup.getByText("預測「各分公司營收」下季將較本期成長約 8%。")).toHaveCount(0);

  // E09-S020 "Prediction disclaimer" — additive again: a constant,
  // honest-mock disclosure shown alongside the prediction result.
  await expect(
    predictionGroup.getByText(
      "（模擬預測）此預測套用固定的簡化成長率假設，並非真實財務預測或對未來表現的保證，正式版本中將由實際的預測模型產生。",
    ),
  ).toBeVisible();
});
