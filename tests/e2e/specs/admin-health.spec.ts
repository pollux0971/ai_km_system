import { test, expect } from "@playwright/test";

/**
 * E11-S022 "System health dashboard" critical seam — same no-session-gate
 * shape admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why). Both subsystems are
 * always "狀態未知" today (see system-health.ts's own doc comment for
 * why — the real health-check capability, E10-S04/E12-S005, is Team B's
 * and hasn't been built) — this honestly exercises exactly that real
 * production state.
 */
test("E11-S022: navigating from the admin home to 系統健康儀表板 shows every subsystem with an honest unknown status", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "系統健康儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/health");

  await expect(page.getByRole("heading", { name: "系統健康儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("連接器", { exact: true })).toBeVisible();
  await expect(page.getByText("模型服務", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未建置真正的健康檢查機制，以上狀態皆為「未知」，不代表系統異常。", { exact: true })).toBeVisible();
});
