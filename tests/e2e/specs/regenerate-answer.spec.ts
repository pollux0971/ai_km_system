import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S019 critical flow: regenerating the last (settled) assistant
 * reply replaces it with a fresh one, and the old reply doesn't linger
 * as a duplicate after a reload. Navigation after login always uses
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

test("E03-S019: regenerating the last assistant reply replaces it, without leaving a duplicate after reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);

  await page.getByRole("button", { name: "重新產生" }).click();

  // Mid-regeneration: the same in-flight rules apply as any other turn
  // (E03-S017) — sending is blocked while it's running.
  await expect(page.getByText("搜尋中…")).toBeVisible();
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();

  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);
  await expect(messageItems(page).nth(1)).toContainText("模擬回覆");

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  // Exactly 2 messages survive the reload — the regenerated reply
  // replaced the original, it didn't add a second one alongside it.
  await expect(messageItems(page)).toHaveCount(2);
});

test("E03-S019: the regenerate action is only offered on the last message, not on the user's own message", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByRole("button", { name: "重新產生" })).toHaveCount(1);
  await expect(messageItems(page).nth(0).getByRole("button", { name: "重新產生" })).toHaveCount(0);
});
