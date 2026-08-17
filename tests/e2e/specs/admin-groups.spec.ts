import { test, expect } from "@playwright/test";

/**
 * E11-S010 "Group management" critical seam — same no-session-gate
 * shape admin-departments.spec.ts's own S009 test already establishes
 * (see admin-smoke.spec.ts's doc comment for why), and the same
 * list+create structure S009 already establishes for a sibling
 * Team-B-owned entity treated as a self-contained frontend mock.
 */
test("E11-S010: navigating from the admin home to 群組管理 shows the seeded groups, and creating a new one persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "群組管理" }).click();
  await page.waitForURL((url) => url.pathname === "/groups");

  await expect(page.getByRole("heading", { name: "群組管理", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("一般使用者群組", { exact: true })).toBeVisible();
  await expect(page.getByText("維修工程師群組", { exact: true })).toBeVisible();
  await expect(page.getByText("業務群組", { exact: true })).toBeVisible();

  await page.getByLabel("群組名稱").fill("稽核群組");
  await page.getByRole("button", { name: "新增群組" }).click();
  await expect(page.getByText("稽核群組", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("稽核群組", { exact: true })).toBeVisible();
  await expect(page.getByText("一般使用者群組", { exact: true })).toBeVisible();
});
