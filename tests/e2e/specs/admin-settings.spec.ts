import { test, expect } from "@playwright/test";

/**
 * E11-S020 "System settings" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why). Unlike the Audit/
 * Feedback/Document-failure queues, this toggle genuinely round-trips
 * through sessionStorage — same real "persists across reload" flow
 * admin-models.spec.ts (E11-S013) already establishes for a different
 * setting.
 */
test("E11-S020: navigating from the admin home to 系統設定 shows SSO enabled by default, and disabling it persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "系統設定" }).click();
  await page.waitForURL((url) => url.pathname === "/settings");

  await expect(page.getByRole("heading", { name: "系統設定", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("已啟用", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "停用" }).click();
  await expect(page.getByText("已停用", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "啟用" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("已停用", { exact: true })).toBeVisible();
});
