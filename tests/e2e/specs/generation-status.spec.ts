import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S011 critical flow: the Searching/Reading/Generating phase
 * indicator shown before an assistant reply's text starts arriving.
 * With the real default pacing (300ms/phase, 20ms/char reply), the
 * whole sequence is fast enough to assert on directly without needing
 * to freeze time. Navigation after login always uses in-app link
 * clicks, never page.goto() — see conversations.spec.ts's file doc
 * comment for why.
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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S011: sending a message shows the Searching/Reading/Generating phases in order before the reply text appears", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText("搜尋中…")).toBeVisible();
  await expect(page.getByText("讀取中…")).toBeVisible();
  await expect(page.getByText("生成中…")).toBeVisible();

  // Once real reply text starts arriving, the phase label gives way to
  // the generic streaming indicator, then the settled reply.
  await expect(page.getByText("生成中…")).not.toBeVisible({ timeout: 15000 });
  const items = page.getByRole("list", { name: "對話串" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("模擬回覆");
});
