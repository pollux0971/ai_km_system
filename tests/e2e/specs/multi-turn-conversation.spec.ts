import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S017 critical flow: a second full send→reply turn works correctly
 * after the first settles, with all four messages visible in the right
 * order, and sending is blocked while a turn is still in flight.
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

// Scoped to <main> — see streaming-response.spec.ts's file doc comment
// for why an unscoped page.getByRole("listitem") collides with the
// sidebar nav's own <ul>/<li> structure.
function messageItems(page: import("@playwright/test").Page) {
  return page.getByRole("list", { name: "對話串" }).getByRole("listitem");
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S017: sending is blocked while a turn is in flight, then a second full turn works after the first settles", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  // Still mid-turn (phase sequence + streaming, ~1.8s+) — sending again
  // must be blocked even though the composer already accepts new text.
  await expect(page.getByText("搜尋中…")).toBeVisible();
  await page.getByLabel("訊息").fill("這句不該送得出去");
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();

  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "送出" })).toBeEnabled();

  // The still-drafted text from the blocked attempt above is exactly
  // what gets sent now that the first turn has settled — proving the
  // composer never silently discarded it while disabled.
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const items = messageItems(page);
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("保固期限是多久？");
  await expect(items.nth(1)).toContainText("模擬回覆");
  await expect(items.nth(2)).toContainText("這句不該送得出去");
  await expect(items.nth(3)).toContainText("模擬回覆");
});

test("E03-S017: a full two-turn conversation persists in order across leaving and returning", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("第一個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("第二個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  const items = messageItems(page);
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("第一個問題");
  await expect(items.nth(2)).toContainText("第二個問題");
});
