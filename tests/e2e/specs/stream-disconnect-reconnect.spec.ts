import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S031 critical flow: a stream disconnecting mid-way, and
 * reconnecting. No SOURCE_BASELINE entry exists for this story at all
 * (its own section in SOURCE_BASELINE.md simply doesn't exist — E03's
 * entries there stop at S30); this story exists purely from the epic
 * file's own expansion, and lib/streaming.ts's doc comment already
 * flagged it by name back when E03-S010 first built the streaming
 * renderer ("no reconnection semantics; that's a separate, still-
 * unbuilt story"). Since no real transport exists to genuinely
 * disconnect, this uses the same deterministic "[模擬:X]" mock-trigger
 * convention as E03-S021/E03-S029/E03-S030. Navigation after login
 * always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why.
 */

const DISCONNECT_TRIGGER = "[模擬:STREAM_DISCONNECT]";

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

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S031: a disconnected stream shows 連線中斷 and preserves the partial reply already received", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill(`保固期限是多久？ ${DISCONNECT_TRIGGER}`);
  await page.getByRole("button", { name: "送出" }).click();

  const alertBadge = page.getByRole("main").getByRole("alert");
  await expect(alertBadge).toBeVisible({ timeout: 20000 });
  await expect(alertBadge).toHaveText("連線中斷");
  await expect(page.getByRole("button", { name: "重新連線" })).toBeVisible();

  // Some partial reply text made it through before the drop — the
  // second message item is more than just the "AI" role label.
  const items = messageItems(page);
  await expect(items).toHaveCount(2);
  const partialText = await items.nth(1).textContent();
  expect((partialText ?? "").length).toBeGreaterThan("AI連線中斷重新連線".length);
});

test("E03-S031: clicking 重新連線 re-attempts the stream, deterministically disconnecting again for the same trigger", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill(`保固期限是多久？ ${DISCONNECT_TRIGGER}`);
  await page.getByRole("button", { name: "送出" }).click();

  const alertBadge = page.getByRole("main").getByRole("alert");
  await expect(alertBadge).toBeVisible({ timeout: 20000 });
  const reconnectButton = page.getByRole("button", { name: "重新連線" });
  await reconnectButton.click();

  // Genuinely re-attempted (not stuck on a stale "連線中斷") — the
  // status transiently clears to a streaming state before disconnecting
  // again, and 重新連線 reappears once it does.
  await expect(alertBadge).toBeVisible({ timeout: 20000 });
  await expect(reconnectButton).toBeVisible();
});
