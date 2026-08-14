import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S027 critical flow: copying an assistant reply's text to the
 * clipboard. Reading the clipboard back to verify content (not just
 * asserting the button's own label) needs an explicit permission grant
 * in Chromium — writing alone (from a real user-gesture click) does
 * not. Navigation after login always uses in-app link clicks, never
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

// lib/streaming.ts's MOCK_REPLY — the fixed mock reply text every
// successful turn streams back, literal `[1]` citation marker included
// (see that file's own doc comment for why). Asserting against this
// known literal is more robust than scraping the rendered <li>'s text,
// which would also pick up the role label span ("AI") and any action
// button labels sharing the same list item.
const MOCK_REPLY =
  "（模擬回覆）這是前端展示用的固定文字，尚未串接真正的 AI 生成服務。" +
  "真正的回答生成依賴 Model Gateway 與 RAG 平台（E04、E12，Team B），目前都還不存在。[1]";

test("E03-S027: copying an assistant reply puts its exact text on the clipboard and shows 已複製", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);
  await expect(messageItems(page).nth(1)).toContainText("模擬回覆");

  await messageItems(page).nth(1).getByRole("button", { name: "複製" }).click();
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已複製" })).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(MOCK_REPLY);
});

test("E03-S027: the copy button is offered on every settled assistant reply, not only the last one", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  await expect(page.getByRole("button", { name: "複製" })).toHaveCount(2);
  await expect(messageItems(page).nth(1).getByRole("button", { name: "複製" })).toHaveCount(1);
  await expect(messageItems(page).nth(3).getByRole("button", { name: "複製" })).toHaveCount(1);
});
