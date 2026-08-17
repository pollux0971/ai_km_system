import { test, expect } from "@playwright/test";

/**
 * E11-S011 "Knowledge admin" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). Read-only, same as
 * RoleList — see knowledge-bases.ts's own doc comment for why this
 * story doesn't add a create action the way Department/Group did.
 */
test("E11-S011: navigating from the admin home to 知識庫管理 shows every seeded knowledge base", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "知識庫管理" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");

  await expect(page.getByRole("heading", { name: "知識庫管理", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("產品保固政策", { exact: true })).toBeVisible();
  await expect(page.getByText("設備維修標準作業程序", { exact: true })).toBeVisible();
  await expect(page.getByText("人力資源與請假規範", { exact: true })).toBeVisible();
});
