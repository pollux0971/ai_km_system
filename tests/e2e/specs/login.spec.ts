import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S002/E01-S003 critical flow: local login against the mock AuthClient
 * (see apps/web/src/lib/auth.ts), followed by the E01-S003 return-url
 * redirect. Session bootstrap (E01-S004) is a separate story.
 *
 * A successful login now navigates immediately (see
 * apps/web/src/app/(public)/login/login-form.tsx), so the transient
 * "登入成功。" text isn't a reliable thing to assert against a real
 * browser navigation — that state transition is covered stably by
 * login-form.test.tsx, where router.push is a mock and the component
 * stays mounted. Here we assert the navigation outcome instead.
 */
test("local login succeeds and lands on / when no returnUrl is given", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "AI KM — apps/web" })).toBeVisible();
});

test("local login shows an invalid-credential error and never reports success", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("帳號").fill("wrong-user");
  await page.getByLabel("密碼").fill("wrong-password");
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await expect(page.getByText("帳號或密碼錯誤。")).toBeVisible();
  await expect(page.getByText("登入成功。")).not.toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("E01-S003: redirects to the returnUrl query param after a successful login", async ({ page }) => {
  await page.goto("/login?returnUrl=%2Freturn-url-target");

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  // /return-url-target isn't a real route yet (owned by a future story) —
  // landing on its not-found page still proves the redirect itself fired
  // to the right place, which is all this story owns.
  await page.waitForURL((url) => url.pathname === "/return-url-target");
  await expect(page.getByRole("heading", { name: "頁面不存在" })).toBeVisible();
});

test("E01-S003: falls back to / for an absolute external returnUrl (open-redirect defense)", async ({
  page,
}) => {
  await page.goto("/login?returnUrl=" + encodeURIComponent("https://evil.example/phish"));

  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();

  await page.waitForURL((url) => url.pathname === "/");
  expect(page.url()).not.toContain("evil.example");
  await expect(page.getByRole("heading", { name: "AI KM — apps/web" })).toBeVisible();
});
