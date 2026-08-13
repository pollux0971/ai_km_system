import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S004 critical flow: the (app) shell's session gate. This is the
 * other half of E01-S003's returnUrl redirect — S003 only handled
 * returning FROM /login; this is what actually sends an unauthenticated
 * visitor there in the first place, with the originally requested path
 * attached.
 */
test("visiting a protected route while unauthenticated redirects to /login with a matching returnUrl", async ({
  page,
}) => {
  await page.goto("/");

  await page.waitForURL((url) => url.pathname === "/login");
  expect(new URL(page.url()).searchParams.get("returnUrl")).toBe("/");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
});

test("full round trip: protected route -> login redirect -> back on the protected route, authenticated", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL((url) => url.pathname === "/login");

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "AI KM — apps/web" })).toBeVisible();
  // E01-S005's header/user-menu is the permanent proof the session reached
  // the page tree — supersedes the "Signed in as" text E01-S004 used.
  await expect(page.getByRole("button", { name: MOCK_VALID_USER_ID })).toBeVisible();
});
