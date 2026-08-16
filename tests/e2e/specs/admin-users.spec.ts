import { test, expect } from "@playwright/test";

/**
 * E11-S002 "User list" critical seam — no session gate exists yet
 * (see admin-smoke.spec.ts's own doc comment), so this navigates
 * directly rather than logging in first.
 */
test("E11-S002: navigating from the admin home to 使用者管理 shows the seeded users, including roles and a disabled account", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "使用者管理" }).click();
  await page.waitForURL((url) => url.pathname === "/users");

  await expect(page.getByRole("heading", { name: "使用者管理", level: 1, exact: true })).toBeVisible();

  await expect(page.getByText("示範使用者", { exact: true })).toBeVisible();
  await expect(page.getByText("demo-user@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("資訊部", { exact: true }).first()).toBeVisible();

  // At least one admin-only role is represented, not just the 3
  // non-admin accounts auth-client's own login mock already seeds.
  await expect(page.getByText("示範最高管理員", { exact: true })).toBeVisible();

  // The disabled seed account genuinely shows a distinct status, not
  // silently treated the same as an active one.
  await expect(page.getByText("示範已停用帳號", { exact: true })).toBeVisible();
  await expect(page.getByText("已停用", { exact: true })).toBeVisible();
});
