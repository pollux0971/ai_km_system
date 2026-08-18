import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S013 critical flow: once the assistant's mock reply settles, its
 * embedded `[1]` marker (lib/streaming.ts's MOCK_REPLY) renders as a
 * distinct citation badge, and the user's own message never grows one
 * even though its content can contain the same bracket-number shape.
 * Queried via role "superscript" — the <sup> element's own correct
 * implicit ARIA role — not an explicit role="doc-noteref": Chromium's
 * accessibility tree falls back silently to "superscript" for that DPUB
 * role (verified directly against this page), so asserting on
 * "doc-noteref" would never match here. See message-content.tsx's doc
 * comment for the full reasoning. Navigation after login always uses
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

test("E03-S013: a settled assistant reply renders its [1] marker as a citation badge", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const items = messageItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(1).getByRole("superscript")).toHaveText("[1]");
});

test("E03-S013: the user's own message never grows a citation badge, even if it contains a [N]-shaped substring", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("請看附錄 [1] 的說明");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const items = messageItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("請看附錄 [1] 的說明");
  await expect(items.nth(0).getByRole("superscript")).toHaveCount(0);
});
