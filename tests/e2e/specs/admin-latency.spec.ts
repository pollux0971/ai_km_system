import { test, expect } from "@playwright/test";

/**
 * E13-S013 "Latency dashboard" critical seam — same no-session-gate
 * shape admin-usage.spec.ts's own E11-S021 test already establishes
 * (see admin-smoke.spec.ts's own doc comment for why). The average is
 * always null today (see latency-metrics.ts's own doc comment for
 * why — apps/admin has no channel to read apps/web's real
 * usage-events.ts data) — this honestly exercises exactly that real
 * production state.
 */
test("E13-S013: navigating from the admin home to 延遲儀表板 shows an honest no-data state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "延遲儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/latency");

  await expect(page.getByRole("heading", { name: "延遲儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("平均回應延遲", { exact: true })).toBeVisible();
  await expect(page.getByText("尚無資料", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未建置跨應用資料管道，無法顯示真實延遲數據。", { exact: true })).toBeVisible();
});
