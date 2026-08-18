import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S020 critical flow: regenerating an answer retains the replaced
 * content as a "先前版本" (prior version) revision, instead of
 * discarding it, and that history survives a reload. Navigation after
 * login always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why.
 *
 * Assertions here are deliberately structural (does the "先前版本（N）"
 * summary appear, with the right count) rather than content-based (does
 * it contain the exact prior text) — lib/streaming.ts's mock reply is a
 * single FIXED string (MOCK_REPLY), so every regeneration in this real
 * end-to-end environment produces byte-identical content to what it's
 * replacing. Actually verifying distinct prior content is covered at
 * the component-test layer (message-thread.test.tsx), which mocks
 * streamAssistantReply with deliberately distinct text per regeneration
 * — something E2E can't do without fabricating variation the mock was
 * never designed to produce (lib/streaming.ts's own doc comment already
 * explains why it's a single honestly-labeled placeholder, not
 * simulated varied content).
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

test("E03-S020: regenerating an answer retains the replaced content as a visible revision instead of discarding it", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  // Nothing revised yet — no history affordance.
  await expect(page.getByText("先前版本", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "重新產生" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByText("先前版本（1）")).toBeVisible();
});

test("E03-S020: regenerating twice accumulates the revision count instead of resetting it", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByRole("button", { name: "重新產生" }).click();
  await waitForThreadToSettle(page);
  await expect(page.getByText("先前版本（1）")).toBeVisible();

  await page.getByRole("button", { name: "重新產生" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByText("先前版本（2）")).toBeVisible();
  await expect(page.getByText("先前版本（1）")).toHaveCount(0);
});

test("E03-S020: revision history survives leaving and returning to the conversation", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByRole("button", { name: "重新產生" }).click();
  await waitForThreadToSettle(page);
  await expect(page.getByText("先前版本（1）")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByText("先前版本（1）")).toBeVisible();
});
