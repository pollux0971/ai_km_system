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
  for (const entry of ALL_ADMIN_ENTRIES) {
    await page.goto("/");
    await page.getByRole("link", { name: entry.link }).click();
    await page.waitForURL((url) => url.pathname === entry.pathname);
    await expect(page.getByRole("heading", { name: entry.heading, level: 1, exact: true })).toBeVisible();
  }
});

test("E13-S017: consecutively visiting the feedback queue, usage dashboard, and latency dashboard in one session shows each one's own distinct honest empty/zero state, without any of the three bleeding into another", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");
  await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await expect(page.getByText(/OK 比例/)).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("link", { name: "使用量儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/usage");
  await expect(page.getByText("每日活躍使用者（DAU）", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未建置使用量追蹤機制，以上數據皆為零。", { exact: true })).toBeVisible();
  await expect(page.getByText("尚無回饋。")).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("link", { name: "延遲儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/latency");
  await expect(page.getByText("尚無資料", { exact: true })).toBeVisible();
  await expect(page.getByText("每日活躍使用者（DAU）")).toHaveCount(0);
  await expect(page.getByText("尚無回饋。")).toHaveCount(0);

  // Full loop back to the feedback queue: still its own state, unaffected
  // by having just visited the other two dashboards in between.
  await page.goto("/");
  await page.getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");
  await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
});
