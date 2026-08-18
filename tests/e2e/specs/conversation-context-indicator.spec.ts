import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S018 critical flow: the conversation context indicator shows how
 * many prior messages exist, updates as turns settle, and does not
 * count in-flight (not-yet-persisted) messages. Navigation after login
 * always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why.
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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S018: the indicator is hidden while the thread is empty, appears once a message is in flight, excludes it until it settles, then updates as turns settle", async ({
  page,
}) => {
  await openConversation(page);

  // No indicator alongside EmptyState — showing two differently-worded
  // "nothing yet" statements at once would be redundant, not helpful.
  await expect(page.getByText("尚無訊息，開始對話吧。")).toBeVisible();
  await expect(page.getByText("上下文：目前尚無先前訊息。")).not.toBeVisible();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  // By the time the phase sequence is visible, the user's own message
  // has already settled to sent (attemptSend reconciles pending→sent
  // before calling startStream) — so the count is 1, not 0 or 2 yet:
  // the assistant's reply is still in flight and correctly excluded.
  await expect(page.getByText("搜尋中…")).toBeVisible();
  await expect(page.getByText("上下文：包含 1 則先前訊息。")).toBeVisible();

  await waitForThreadToSettle(page);
  await expect(page.getByText("上下文：包含 2 則先前訊息。")).toBeVisible();

  await page.getByLabel("訊息").fill("第二個問題");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByText("上下文：包含 4 則先前訊息。")).toBeVisible();
});

test("E03-S018: the context count persists correctly across leaving and returning to the conversation", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(page.getByText("上下文：包含 2 則先前訊息。")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByText("上下文：包含 2 則先前訊息。")).toBeVisible();
});
