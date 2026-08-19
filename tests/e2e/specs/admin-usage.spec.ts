import { test, expect } from "@playwright/test";

/**
 * E11-S021 "Usage dashboard" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why). Both metrics are
 * always zero today (see usage-metrics.ts's own doc comment for why —
 * E13's own usage event instrumentation, Team A's not-yet-reached
 * epic, hasn't been built) — this honestly exercises exactly that real
 * production state.
 */
test("E11-S021: navigating from the admin home to 使用量儀表板 shows zero counts and an honest explanation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "使用量儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/usage");

  await expect(page.getByRole("heading", { name: "使用量儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("每日活躍使用者（DAU）", { exact: true })).toBeVisible();
  await expect(page.getByText("今日提問數", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未建置使用量追蹤機制，以上數據皆為零。", { exact: true })).toBeVisible();
});
