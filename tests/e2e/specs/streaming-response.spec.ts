import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S010 critical flow: after sending a message, a simulated
 * assistant reply streams in progressively and settles. The reply
 * content itself is a fixed mock placeholder (lib/streaming.ts) — no
 * real Model Gateway exists — so these tests assert on the streaming
 * *mechanics* (status indicator appears then disappears, content ends
 * up non-empty, a second list item appears), not on any specific
 * generated wording. Navigation after login always uses in-app link
 * clicks, never page.goto() — see conversations.spec.ts's file doc
 * comment for why.
 *
 * Waits for the settled state via the absence of any `role="status"`
 * element in the thread (`toHaveCount(0, ...)`) — not via the message
 * list's item count (an optimistic "streaming" placeholder is already
 * its own list item well before the reply is actually persisted, so
 * waiting for count alone doesn't prove settlement) and not by waiting
 * for "AI 回覆中…" specifically to disappear (E03-S011 added a
 * Searching/Reading/Generating phase sequence before that text ever
 * appears, so waiting for it to *not* be visible would resolve almost
 * immediately — trivially true before it ever appears — rather than
 * actually waiting for completion). Every in-progress state (pending/
 * streaming/each generation phase) renders its own `role="status"`;
 * only a fully "sent" entry renders none.
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

// Scoped to <main> — the sidebar nav also renders as a <ul>/<li> list,
// so an unscoped page.getByRole("listitem") matches both (same
// collision fixed in file-attachment-picker.spec.ts). The whole
// conversation detail page's content, including MessageThread, renders
// inside <main> (see conversation-detail.tsx), which the sidebar nav
// sits outside of as its own landmark.
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

test("E03-S010: sending a message triggers a streaming assistant reply that settles with content", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const items = messageItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("模擬回覆");
});

test("E03-S010: the assistant reply persists across leaving and returning to the conversation", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  const conversationUrl = page.url();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  const items = messageItems(page);
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("模擬回覆");
});
