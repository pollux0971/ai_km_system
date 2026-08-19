import { test, expect } from "@playwright/test";

/**
 * E11-S013 "Model admin" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). Exercises the exact
 * "enable the disabled cloud model" action apps/web's own ai-models.ts
 * doc comment already names as this story's job.
 */
test("E11-S013: navigating from the admin home to 模型管理 shows all 3 seeded models, and enabling 雲端模型 persists across a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "模型管理" }).click();
  await page.waitForURL((url) => url.pathname === "/models");

  await expect(page.getByRole("heading", { name: "模型管理", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("標準模型（地端）", { exact: true })).toBeVisible();
  await expect(page.getByText("進階模型（地端）", { exact: true })).toBeVisible();
  await expect(page.getByText("雲端模型", { exact: true })).toBeVisible();

  const cloudRow = page.getByRole("main").getByRole("listitem").filter({ hasText: "雲端模型" });
  await expect(cloudRow.getByText("已停用", { exact: true })).toBeVisible();

  await cloudRow.getByRole("button", { name: "啟用" }).click();
  await expect(cloudRow.getByText("啟用中", { exact: true })).toBeVisible();

  await page.reload();
  const cloudRowAfterReload = page.getByRole("main").getByRole("listitem").filter({ hasText: "雲端模型" });
  await expect(cloudRowAfterReload.getByText("啟用中", { exact: true })).toBeVisible();
});
