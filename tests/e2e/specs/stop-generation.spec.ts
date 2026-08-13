import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S012 critical flow: stopping an in-progress assistant reply.
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
  return page.getByRole("main").getByRole("listitem");
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S012: stopping during the phase sequence removes the entry entirely, leaving only the user's own message", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  await expect(page.getByText("搜尋中…")).toBeVisible();
  await page.getByRole("button", { name: "停止生成" }).click();

  await expect(page.getByRole("button", { name: "停止生成" })).not.toBeVisible();
  await expect(messageItems(page)).toHaveCount(1);
});

test("E03-S012: stopping after some reply text has streamed in keeps that partial text as the settled message", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();

  // Let some real text accumulate before stopping. The phase sequence
  // alone takes ~1.8s (3 phases × 600ms) — waiting for "AI 回覆中…"
  // (the fallback shown only once real text has started arriving,
  // replacing the phase label) is what actually confirms we're past
  // it, not just waiting for the stop button to exist (which appears
  // immediately, well before any phase or real text shows).
  await expect(page.getByText("AI 回覆中…")).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "停止生成" }).click();

  await expect(page.getByRole("button", { name: "停止生成" })).not.toBeVisible();
  const items = messageItems(page);
  // Item count staying at 2 (not reverting to 1) already proves some
  // real content had arrived before the stop was processed — an
  // entirely-empty stop removes the entry outright (see the other
  // test). The text-length check below additionally confirms it's
  // genuine reply content, not just the "AI" role-label span (which
  // alone would already make textContent non-empty).
  await expect(items).toHaveCount(2);
  const stoppedText = await items.nth(1).textContent();
  expect((stoppedText ?? "").length).toBeGreaterThan("AI".length);
});
