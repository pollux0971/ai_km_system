import { test, expect } from "@playwright/test";
import { MOCK_MAINTENANCE_USER_ID, MOCK_MAINTENANCE_USERNAME, MOCK_VALID_PASSWORD } from "@ai-km/auth-client";

/**
 * E01-S010 critical flow: reaching the Profile view via the user-menu
 * and seeing the logged-in account's real profile fields.
 */
test("navigating to 個人資料 from the user-menu shows the logged-in account's profile", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_MAINTENANCE_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.getByRole("button", { name: MOCK_MAINTENANCE_USER_ID }).click();
  await page.getByRole("menuitem", { name: "個人資料" }).click();

  await page.waitForURL((url) => url.pathname === "/profile");
  await expect(page.getByRole("heading", { name: "個人資料", level: 1 })).toBeVisible();
  await expect(page.getByText("示範維修工程師")).toBeVisible();
  await expect(page.getByText("demo-maintenance@example.com")).toBeVisible();
  await expect(page.getByText("維修部")).toBeVisible();
  // exact: true — "維修工程師" is also a substring of the name
  // ("示範維修工程師") and group ("維修工程師群組") fields above.
  await expect(page.getByText("維修工程師", { exact: true })).toBeVisible();
});
