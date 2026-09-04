import { test, expect } from "@playwright/test";

/**
 * E13-S017 — apps/admin half of this epic's own composition-coverage
 * closer (see analytics-e2e.spec.ts's file doc comment for the apps/web
 * half and the shared "XX E2E" precedent this follows).
 *
 * 稽核落差:`admin-e2e.spec.ts`(E11-S025)的 `ALL_ADMIN_ENTRIES` 清單在
 * E11 收尾時(15 個入口)寫死凍結,但 E13-S013(latency dashboard)後來
 * 才新增了第 16 個入口「延遲儀表板」(`/latency`)——`ALL_ADMIN_ENTRIES`
 * 是既有已核准測試內容,依 STORY_WORKFLOW 只能新增不能修改,所以「延遲
 * 儀表板現在也真的可以在同一個連續 session 裡,跟其他既有入口一起被
 * 走到」這件事從未被任何測試涵蓋過。另外,E13 自己在 apps/admin 新增
 * 的三個 analytics 相關頁面——回饋佇列(含 E13-S007 filter/E13-S014
 * OK/NG 比例統計)、使用量儀表板(E11-S021,由 E13-S009/S010/S012 供
 * 資料模型)、延遲儀表板(E13-S013)——從未在同一個連續 session 裡被
 * 一起連續造訪過,無法證明三者互不干擾。
 *
 * 一個測試涵蓋兩者:在同一個連續 session 裡,依序造訪目前 apps/admin
 * 首頁全部 16 個入口(含 `/latency`,補上 E11-S025 凍結後才出現的
 * 落差),然後額外聚焦重新連續造訪三個 E13 analytics 相關頁面,確認
 * 三者各自的誠實空/零狀態文字互不混淆、彼此獨立。
 */

const ALL_ADMIN_ENTRIES: { link: string; pathname: string; heading: string }[] = [
  { link: "使用者管理", pathname: "/users", heading: "使用者管理" },
  { link: "角色管理", pathname: "/roles", heading: "角色管理" },
  { link: "權限矩陣", pathname: "/permissions", heading: "權限矩陣" },
  { link: "部門管理", pathname: "/departments", heading: "部門管理" },
  { link: "群組管理", pathname: "/groups", heading: "群組管理" },
  { link: "知識庫管理", pathname: "/knowledge", heading: "知識庫管理" },
  { link: "提示詞管理", pathname: "/prompts", heading: "提示詞管理" },
  { link: "模型管理", pathname: "/models", heading: "模型管理" },
  { link: "連接器管理", pathname: "/connectors", heading: "連接器管理" },
  { link: "稽核紀錄", pathname: "/audit", heading: "稽核紀錄" },
  { link: "回饋佇列", pathname: "/feedback", heading: "回饋佇列" },
  { link: "文件失敗佇列", pathname: "/document-failures", heading: "文件失敗佇列" },
  { link: "系統設定", pathname: "/settings", heading: "系統設定" },
  { link: "使用量儀表板", pathname: "/usage", heading: "使用量儀表板" },
  { link: "系統健康儀表板", pathname: "/health", heading: "系統健康儀表板" },
  { link: "延遲儀表板", pathname: "/latency", heading: "延遲儀表板" },
];

test("E13-S017: navigating through every current admin home entry link — including the latency dashboard added after E11-S025 froze its own list — reaches its own real page in one continuous session", async ({
  page,
}) => {
  // E01-S027: measured flaky under full-suite CPU contention (this test
  // walks all 16 admin entries in one session, so it accumulates more
  // navigation time than any other single test — archive/stories/E01-S027.md's
  // EVIDENCE has the repeat-each=3 breakdown). `test.slow()` triples this
  // test's own timeout budget so it survives contention without slowing
  // the whole suite via a lower global `workers` count.
  test.slow();
  for (const entry of ALL_ADMIN_ENTRIES) {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: entry.link }).click();
    await page.waitForURL((url) => url.pathname === entry.pathname);
    await expect(page.getByRole("heading", { name: entry.heading, level: 1, exact: true })).toBeVisible();
  }
});

/**
 * E13-S021 (real API): the ORIGINAL version of this test hardcoded that
 * all three surfaces show an empty/zero state — true only when nothing
 * else in the same Playwright run has used this shared `demo-super`
 * session yet. `admin-analytics-real.spec.ts` (AC5) sends a real
 * message + feedback under this exact session, and `fullyParallel: true`
 * gives no cross-file ordering guarantee — confirmed broken on a real
 * full-suite run (this test failed once that file existed). Same fix as
 * `admin-feedback.spec.ts`/`admin-usage.spec.ts`/`admin-latency.spec.ts`'s
 * own E13-S021 rewrites: ask the real API what's true right now, then
 * assert each page matches it. The actual point of this test — that the
 * three surfaces are independent and don't bleed into each other — is
 * unchanged and still fully asserted (the negative "X's text does not
 * appear on Y's page" checks below are state-independent: they'd fail
 * regardless of whether the state is empty or real).
 */
test("E13-S017: consecutively visiting the feedback queue, usage dashboard, and latency dashboard in one session shows each one's own distinct real state, without any of the three bleeding into another", async ({
  page,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  // Each metric is fetched immediately before the page that renders it —
  // not once up front for all three — because `admin-analytics-real.spec.ts`
  // (AC5) can insert real data from a DIFFERENT parallel worker at any
  // moment (`fullyParallel: true`, same shared `demo-super` session).
  // Snapshotting all three truths before any navigation left a multi-page
  // window (three `page.goto`s + assertions) for that other worker to
  // change the "truth" out from under an already-captured value —
  // confirmed by an actual failure on a real full-suite run (DAU
  // mismatch). Fetching right before each check narrows that window to
  // effectively zero, same pattern `admin-usage.spec.ts`/
  // `admin-latency.spec.ts`'s own single-page E13-S021 tests already use.

  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");
  const feedbackRes = await page.request.get("/api/v1/admin/feedback?page=1&pageSize=20");
  expect(feedbackRes.ok(), `GET /admin/feedback failed: ${feedbackRes.status()}`).toBe(true);
  const { totalCount: feedbackCount } = (await feedbackRes.json()) as { totalCount: number };
  if (feedbackCount === 0) {
    await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
    await expect(page.getByText(/OK 比例/)).toHaveCount(0);
  } else {
    await expect(page.getByText(/OK 比例/)).toBeVisible();
  }
  await expect(page.getByRole("radiogroup")).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "使用量儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/usage");
  await expect(page.getByText("每日活躍使用者（DAU）", { exact: true })).toBeVisible();
  const usageRes = await page.request.get(`/api/v1/admin/metrics/usage?date=${today}`);
  expect(usageRes.ok(), `GET /admin/metrics/usage failed: ${usageRes.status()}`).toBe(true);
  const { dailyActiveUsers } = (await usageRes.json()) as { dailyActiveUsers: number };
  const dauBlock = page.getByText("每日活躍使用者（DAU）", { exact: true }).locator("..");
  await expect(dauBlock.getByText(String(dailyActiveUsers), { exact: true })).toBeVisible();
  await expect(page.getByText("尚無回饋。")).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "延遲儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/latency");
  const latencyRes = await page.request.get("/api/v1/admin/metrics/latency");
  expect(latencyRes.ok(), `GET /admin/metrics/latency failed: ${latencyRes.status()}`).toBe(true);
  const { averageLatencyMs } = (await latencyRes.json()) as { averageLatencyMs: number | null };
  if (averageLatencyMs === null) {
    await expect(page.getByText("尚無資料", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(`${averageLatencyMs}ms`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("每日活躍使用者（DAU）")).toHaveCount(0);
  await expect(page.getByText("尚無回饋。")).toHaveCount(0);

  // Full loop back to the feedback queue: still its own state, unaffected
  // by having just visited the other two dashboards in between. Re-fetched
  // (not reusing the earlier `feedbackCount`) for the same staleness
  // reason as every other check in this test.
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");
  const feedbackRes2 = await page.request.get("/api/v1/admin/feedback?page=1&pageSize=20");
  expect(feedbackRes2.ok(), `GET /admin/feedback failed: ${feedbackRes2.status()}`).toBe(true);
  const { totalCount: feedbackCount2 } = (await feedbackRes2.json()) as { totalCount: number };
  if (feedbackCount2 === 0) {
    await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(/OK 比例/)).toBeVisible();
  }
});
