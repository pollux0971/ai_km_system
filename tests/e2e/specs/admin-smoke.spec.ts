import { test, expect } from "@playwright/test";

/**
 * E11-S001 route-skeleton seam for apps/admin — the direct counterpart
 * of specs/smoke.spec.ts's own E01-S001 tests, adapted for admin's
 * actual current reality: no session/route gating exists yet (that's
 * E11-S023's own job, the counterpart of apps/web's E01-S017 RoleGuard —
 * apps/web itself ran ungated from S001 through S016), so "/" renders
 * directly instead of redirecting anywhere.
 */
test("E11-S001: admin console home renders directly (no session gate exists yet)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AI KM 管理主控台", level: 1, exact: true })).toBeVisible();
});

test("E11-S001: unknown admin route falls through to not-found", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: "頁面不存在", exact: true })).toBeVisible();
});
