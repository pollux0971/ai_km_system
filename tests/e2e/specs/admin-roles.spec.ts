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

/**
 * E11-S007 "Role editor" — clicking a role's own row from the list (the
 * link E11-S007 added, per role-list.tsx's own doc comment) reaches a
 * dedicated /roles/{role} page where its description can be edited and
 * saved, with the change surviving a reload (sessionStorage-backed,
 * same persistence guarantee every other mutation in this codebase
 * already has).
 */
test("E11-S007: editing a role's description from its own page persists across a reload", async ({ page }) => {
  await page.goto("/roles");
  await page.getByRole("link", { name: "auditor" }).click();
  await page.waitForURL((url) => url.pathname === "/roles/auditor");

  await expect(page.getByRole("heading", { name: "auditor", level: 1 })).toBeVisible();
  await expect(page.getByLabel("角色說明")).toHaveValue("查看 Audit、Security Event。");

  await page.getByLabel("角色說明").fill("負責稽核與安全事件審閱。");
  await page.getByRole("button", { name: "儲存" }).click();

  await expect(page.getByText("已儲存。", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("角色說明")).toHaveValue("負責稽核與安全事件審閱。");

  await page.goto("/roles");
  await expect(page.getByText("負責稽核與安全事件審閱。", { exact: true })).toBeVisible();
});

test("E11-S007: visiting an unknown role shows a distinct not-found state", async ({ page }) => {
  await page.goto("/roles/this-role-does-not-exist");

  await expect(page.getByText("找不到這個角色。", { exact: true })).toBeVisible();
});
