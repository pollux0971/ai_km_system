import { test, expect } from "@playwright/test";

/**
 * E11-S009 "Department management" critical seam — same no-session-gate
 * shape admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why).
 */
test("E11-S009: navigating from the admin home to 部門管理 shows the seeded departments, and creating a new one persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "部門管理" }).click();
  await page.waitForURL((url) => url.pathname === "/departments");

  await expect(page.getByRole("heading", { name: "部門管理", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("資訊部", { exact: true })).toBeVisible();
  await expect(page.getByText("維修部", { exact: true })).toBeVisible();
  await expect(page.getByText("業務部", { exact: true })).toBeVisible();
  await expect(page.getByText("稽核部", { exact: true })).toBeVisible();

  await page.getByLabel("部門名稱").fill("行銷部");
  await page.getByRole("button", { name: "新增部門" }).click();
  await expect(page.getByText("行銷部", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("行銷部", { exact: true })).toBeVisible();
  await expect(page.getByText("資訊部", { exact: true })).toBeVisible();
});
