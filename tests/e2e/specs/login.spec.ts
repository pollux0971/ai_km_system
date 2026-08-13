import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S002 critical flow: local login against the mock AuthClient (see
 * apps/web/src/lib/auth.ts). Redirect-after-login (E01-S003) and session
 * bootstrap (E01-S004) are separate stories, so this only asserts the
 * login page's own success/failure states.
 */
test("local login succeeds with the documented mock credentials", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await expect(page.getByText("登入成功。")).toBeVisible();
});

test("local login shows an invalid-credential error and never reports success", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("帳號").fill("wrong-user");
  await page.getByLabel("密碼").fill("wrong-password");
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await expect(page.getByText("帳號或密碼錯誤。")).toBeVisible();
  await expect(page.getByText("登入成功。")).not.toBeVisible();
});
