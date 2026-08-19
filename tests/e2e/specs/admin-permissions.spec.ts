import { test, expect } from "@playwright/test";

/**
 * E11-S008 "Permission matrix" critical seam — same no-session-gate
 * shape admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why).
 */
test("E11-S008: navigating from the admin home to 權限矩陣 shows every role's capabilities in a grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "權限矩陣" }).click();
  await page.waitForURL((url) => url.pathname === "/permissions");

  await expect(page.getByRole("heading", { name: "權限矩陣", level: 1, exact: true })).toBeVisible();

  await expect(page.getByRole("columnheader", { name: "部門 KB" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Audit" })).toBeVisible();

  const departmentManagerRow = page.getByRole("row", { name: /department_manager/ });
  await expect(departmentManagerRow).toBeVisible();

  const generalUserRow = page.getByRole("row", { name: /general_user/ });
  await expect(generalUserRow).toBeVisible();

  for (const role of [
    "general_user",
    "department_manager",
    "knowledge_manager",
    "maintenance_engineer",
    "sales_purchasing",
    "it_administrator",
    "ai_administrator",
    "auditor",
    "super_administrator",
  ]) {
    await expect(page.getByText(role, { exact: true })).toBeVisible();
  }
});
