import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S005 critical flow: giving feedback on an individual `[1]` citation
 * badge (as opposed to S001-S004's whole-answer feedback). Every mock
 * assistant reply embeds exactly one `[1]` marker (lib/streaming.ts's
 * MOCK_REPLY), so the drawer opened via "檢視引用來源 1" is the real
 * end-to-end path; a second citation id ("2") exists in
 * lib/citations.ts's mock data but is never embedded in a live reply
 * (same S014-established limitation this file inherits, not new here),
 * so multi-citation-within-one-message isolation is covered at the
 * component level (message-thread.test.tsx) rather than here — this file
 * instead proves cross-MESSAGE isolation, which the live app CAN
 * exercise with two real replies. Same in-app navigation precedent as
 * every other E13 spec (never page.goto()/page.reload(), which wipes the
 * mock AuthClient's in-memory session and bounces to /login).
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

// The drawer is a single shared region rendered once at the bottom of
// the page (see message-thread.tsx's own doc comment), not nested inside
// any one message <li> — so it's queried via `page`, not scoped to a
// `messageItems(page).nth(n)` locator the way the citation badge button
// itself (inside the message content) is.
function previewDrawer(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "引用來源預覽" });
}

test("E13-S005: giving 此引用有幫助 feedback on the [1] citation locks both citation buttons and persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(previewDrawer(page)).toBeVisible();

  await previewDrawer(page).getByRole("button", { name: "此引用有幫助" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用有幫助" })).toBeVisible();
  await expect(previewDrawer(page).getByRole("button", { name: "此引用不準確" })).toBeDisabled();

  await previewDrawer(page).getByRole("button", { name: "關閉" }).click();
  await expect(previewDrawer(page)).not.toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);
  await waitForThreadToSettle(page);

  await messageItems(page).nth(1).getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用有幫助" })).toBeVisible();
});

test("E13-S005: citation feedback given on one assistant reply's [1] citation does not affect another reply's [1] citation", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  const firstReply = messageItems(page).nth(1);
  const secondReply = messageItems(page).nth(3);

  await firstReply.getByRole("button", { name: "檢視引用來源 1" }).click();
  await previewDrawer(page).getByRole("button", { name: "此引用有幫助" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用有幫助" })).toBeVisible();
  await previewDrawer(page).getByRole("button", { name: "關閉" }).click();
  await expect(previewDrawer(page)).not.toBeVisible();

  await secondReply.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "此引用有幫助" })).toBeVisible();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用有幫助" })).toHaveCount(0);
});
