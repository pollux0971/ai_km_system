import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S001 critical flow: giving "OK"/helpful feedback on an assistant
 * reply. Navigation after login always uses in-app link clicks, never
 * page.goto()/page.reload() — a real hard reload wipes the mock
 * AuthClient's in-memory session (no cookie/localStorage backing) and
 * bounces to /login, same documented precedent as
 * rename-conversation.spec.ts's own "persists across reload" test
 * (navigates away to 首頁 and back in-app) and erp-e2e.spec.ts's file
 * doc comment.
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
  return page.getByRole("main").getByRole("listitem");
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E13-S001: giving 有幫助 feedback on an assistant reply persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);

  await messageItems(page).nth(1).getByRole("button", { name: "有幫助" }).click();
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await waitForThreadToSettle(page);
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();
});

test("E13-S001: the 有幫助 button is offered on every settled assistant reply, not only the last one, and never on the user's own message", async ({
  page,
}) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  await expect(page.getByRole("button", { name: "有幫助" })).toHaveCount(2);
  await expect(messageItems(page).nth(0)).not.toContainText("有幫助");
  await expect(messageItems(page).nth(1)).toContainText("有幫助");
  await expect(messageItems(page).nth(2)).not.toContainText("有幫助");
  await expect(messageItems(page).nth(3)).toContainText("有幫助");
});
