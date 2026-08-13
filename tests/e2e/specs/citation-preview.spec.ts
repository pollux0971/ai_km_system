import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S014 critical flow: clicking a citation badge (E03-S013) opens a
 * preview drawer showing that citation's File/Page/Snippet, and closing
 * it removes the drawer again. Navigation after login always uses
 * in-app link clicks, never page.goto() — see conversations.spec.ts's
 * file doc comment for why.
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

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversationWithCitation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
}

test("E03-S014: clicking a citation badge opens a preview drawer with File/Page/Snippet", async ({ page }) => {
  await openConversationWithCitation(page);

  await expect(page.getByRole("region", { name: "引用來源預覽" })).not.toBeVisible();
  await page.getByRole("button", { name: "檢視引用來源 1" }).click();

  const drawer = page.getByRole("region", { name: "引用來源預覽" });
  await expect(drawer).toBeVisible();
  // exact: true — the plain-text field labels ("檔案"/"頁碼"/"片段")
  // would otherwise substring-match their own <dd> values too (e.g.
  // "片段" is a substring of the snippet text's "模擬片段" prefix).
  await expect(drawer.getByText("檔案", { exact: true })).toBeVisible();
  await expect(drawer.getByText("頁碼", { exact: true })).toBeVisible();
  await expect(drawer.getByText("片段", { exact: true })).toBeVisible();
  await expect(drawer).toContainText("模擬來源文件 1");
});

test("E03-S014: closing the preview drawer removes it from the page", async ({ page }) => {
  await openConversationWithCitation(page);

  await page.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(page.getByRole("region", { name: "引用來源預覽" })).toBeVisible();

  await page.getByRole("button", { name: "關閉" }).click();

  await expect(page.getByRole("region", { name: "引用來源預覽" })).not.toBeVisible();
});
