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

/**
 * E11-S004 "Create user" — the "建立使用者" entry link (users/page.tsx)
 * reaches a real form; submitting it lands on the newly created user's
 * own /users/{id} detail page (E11-S003's own route) showing the entered
 * data, and that user is also visible back on the list — proving the
 * sessionStorage-backed persistence survives navigation, not just the
 * single render that created it.
 */
test("E11-S004: creating a user from the admin console reaches their own detail page and the list", async ({ page }) => {
  await page.goto("/users");
  await page.getByRole("link", { name: "建立使用者" }).click();
  await page.waitForURL((url) => url.pathname === "/users/new");

  await page.getByLabel("姓名").fill("E2E 新進使用者");
  await page.getByLabel("電子郵件").fill("e2e-new-user@example.com");
  await page.getByLabel("部門").fill("資訊部");
  await page.getByRole("checkbox", { name: "it_administrator" }).check();
  await page.getByRole("button", { name: "建立" }).click();

  await page.waitForURL((url) => url.pathname !== "/users/new" && url.pathname.startsWith("/users/"));
  await expect(page.getByRole("heading", { name: "E2E 新進使用者", level: 1 })).toBeVisible();
  await expect(page.getByText("e2e-new-user@example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("it_administrator", { exact: true })).toBeVisible();

  await page.goto("/users");
  await expect(page.getByText("E2E 新進使用者", { exact: true })).toBeVisible();
});

test("E11-S004: the submit button stays disabled until the required fields and a role are filled in", async ({ page }) => {
  await page.goto("/users/new");

  const submit = page.getByRole("button", { name: "建立" });
  await expect(submit).toBeDisabled();

  await page.getByLabel("姓名").fill("暫存使用者");
  await page.getByLabel("電子郵件").fill("draft@example.com");
  await page.getByLabel("部門").fill("業務部");
  await expect(submit).toBeDisabled();

  await page.getByRole("checkbox", { name: "sales_purchasing" }).check();
  await expect(submit).toBeEnabled();
});

/**
 * E11-S005 "Disable/enable user" — the per-row 停用/啟用 toggle
 * (mirroring 封存文件/取消封存's own E05-S025 round-trip test) flips a
 * seeded active user to disabled and back, with the change surviving a
 * reload (sessionStorage-backed, same persistence guarantee every other
 * mutation in this file already has).
 */
test("E11-S005: disabling and re-enabling a user from the list updates their status and survives a reload", async ({ page }) => {
  await page.goto("/users");

  const row = page.locator("li").filter({ hasText: "示範使用者" });
  await expect(row.getByText("啟用中", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "停用" }).click();
  await expect(row.getByText("已停用", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "啟用" })).toBeVisible();

  await page.reload();
  const rowAfterReload = page.locator("li").filter({ hasText: "示範使用者" });
  await expect(rowAfterReload.getByText("已停用", { exact: true })).toBeVisible();

  await rowAfterReload.getByRole("button", { name: "啟用" }).click();
  await expect(rowAfterReload.getByText("啟用中", { exact: true })).toBeVisible();
  await expect(rowAfterReload.getByRole("button", { name: "停用" })).toBeVisible();
});
