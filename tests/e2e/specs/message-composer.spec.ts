import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S006 critical flow: the message composer baseline. Only covers
 * the composer's own input/validation/reset lifecycle — there is no
 * message list/history yet (that's S09's job), so these tests do not
 * assert anything about a message appearing anywhere after submit.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

test("E03-S006: the message composer is present and its submit button starts disabled", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByLabel("訊息")).toHaveValue("");
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});

test("E03-S006: typing enables submit, and submitting clears the draft back to empty", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("你好，我想詢問保固期限。");
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled();

  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByLabel("訊息")).toHaveValue("");
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});

test("E03-S006: whitespace-only input never enables submit", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("   ");

  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});
