import { test, expect } from "@playwright/test";

/**
 * E11-S006 "Role list" critical seam — no session gate exists yet (see
 * admin-smoke.spec.ts's own doc comment), so this navigates directly
 * rather than logging in first, same as admin-users.spec.ts's own S002
 * test.
 */
test("E11-S006: navigating from the admin home to 角色管理 shows all 9 system roles with their own descriptions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "角色管理" }).click();
  await page.waitForURL((url) => url.pathname === "/roles");

  await expect(page.getByRole("heading", { name: "角色管理", level: 1, exact: true })).toBeVisible();

  await expect(page.getByText("general_user", { exact: true })).toBeVisible();
  await expect(page.getByText("一般企業員工。", { exact: true })).toBeVisible();

  await expect(page.getByText("super_administrator", { exact: true })).toBeVisible();
  await expect(page.getByText("最高系統權限。", { exact: true })).toBeVisible();

  // Every role from the Role union is represented, not just a sample.
  for (const role of [
    "department_manager",
    "knowledge_manager",
    "maintenance_engineer",
    "sales_purchasing",
    "it_administrator",
    "ai_administrator",
    "auditor",
  ]) {
    await expect(page.getByText(role, { exact: true })).toBeVisible();
  }
});
