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

/**
 * E11-S003 "User detail" — clicking a user's own row from the list
 * (the link E11-S003 added, per user-list.tsx's own doc comment) reaches
 * a dedicated /users/{id} page showing the same fields plus the
 * creation date, and an unknown id shows a distinct not-found state
 * rather than a crash or a blank page.
 */
test("E11-S003: clicking a user from the list opens their own detail page", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("link", { name: "示範 IT 管理員" }).click();
  await page.waitForURL((url) => url.pathname === "/users/mock-user-it-admin");

  await expect(page.getByRole("heading", { name: "示範 IT 管理員", level: 1 })).toBeVisible();
  await expect(page.getByText("demo-it-admin@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("資訊部", { exact: true })).toBeVisible();
  await expect(page.getByText("it_administrator", { exact: true })).toBeVisible();
  await expect(page.getByText("啟用中", { exact: true })).toBeVisible();
  await expect(page.getByText("建立日期：")).toBeVisible();
});

test("E11-S003: visiting an unknown user id shows a distinct not-found state", async ({ page }) => {
  await page.goto("/users/this-user-does-not-exist");

  await expect(page.getByText("找不到這個使用者。", { exact: true })).toBeVisible();
});
