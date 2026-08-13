import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/**
 * E01-S005 critical flow: the authenticated shell's chrome and its one
 * piece of real interactivity — logout via the user-menu.
 */
test("authenticated shell shows the sidebar, header, and user-menu", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("navigation", { name: "主導覽" })).toBeVisible();
  await expect(page.getByRole("link", { name: "首頁" })).toBeVisible();
  await expect(page.getByText("AI KM", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: MOCK_VALID_USER_ID })).toBeVisible();
});

test("logging out via the user-menu clears the session and returns to /login", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: MOCK_VALID_USER_ID }).click();
  await page.getByRole("menuitem", { name: "登出" }).click();

  await page.waitForURL((url) => url.pathname === "/login");

  // Confirm the session was actually cleared (not just a client navigation)
  // by revisiting a protected route and getting sent back to /login again.
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
});
