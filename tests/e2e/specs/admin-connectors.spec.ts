import { test, expect } from "@playwright/test";

/**
 * E11-S014 "Connector admin" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). All 9 connector types
 * start disabled (see connectors.ts's own doc comment for why); this
 * exercises enabling one directly.
 */
test("E11-S014: navigating from the admin home to 連接器管理 shows all 9 connector types, and enabling ERP 連接器 persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "連接器管理" }).click();
  await page.waitForURL((url) => url.pathname === "/connectors");

  await expect(page.getByRole("heading", { name: "連接器管理", level: 1, exact: true })).toBeVisible();
  for (const name of [
    "ERP 連接器",
    "MES 連接器",
    "CRM 連接器",
    "HR 連接器",
    "SCM 連接器",
    "PLM 連接器",
    "IoT 連接器",
    "通用 REST 連接器",
    "資料庫檢視連接器",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  const erpRow = page.getByRole("listitem").filter({ hasText: "ERP 連接器" });
  await expect(erpRow.getByText("已停用", { exact: true })).toBeVisible();

  await erpRow.getByRole("button", { name: "啟用" }).click();
  await expect(erpRow.getByText("啟用中", { exact: true })).toBeVisible();

  await page.reload();
  const erpRowAfterReload = page.getByRole("listitem").filter({ hasText: "ERP 連接器" });
  await expect(erpRowAfterReload.getByText("啟用中", { exact: true })).toBeVisible();
});
