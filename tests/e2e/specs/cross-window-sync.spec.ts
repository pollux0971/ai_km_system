import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S039 AC7 (L5, needs E03-S038's isolated real-API E2E instance +
 * E04-S044's real SSE endpoint — both approved). Two browser contexts as
 * two windows of the SAME account, sharing one real backend session model
 * (owner-scoped event stream, ADR 0003 §7). Every cross-window assertion
 * below only ever follows an in-app link click on the OTHER window's own
 * page — never a `page.reload()`/`page.goto()` on the watching window —
 * because "the other window doesn't need to reload" is the entire point
 * of this story; reloading to make an assertion pass would prove nothing.
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

function sidebarHistory(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "歷史對話" });
}

function messageItems(page: import("@playwright/test").Page) {
  return page.getByRole("list", { name: "對話串" }).getByRole("listitem");
}

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

test("E03-S039 AC7: create+send/rename/delete in window A reaches window B live, no reload", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await login(pageA);
  await login(pageB);
  // B stays on the home dashboard, watching its sidebar's 歷史對話 rail —
  // it is never told to navigate or reload until it reacts to A's own
  // actions below.

  await sidebarNav(pageA).getByRole("link", { name: "對話" }).click();
  await pageA.waitForURL((url) => url.pathname === "/conversations");
  await pageA.getByRole("main").getByRole("link", { name: "開始新對話" }).click();
  await pageA.waitForURL((url) => url.pathname === "/conversations");
  await pageA.getByRole("main").getByText("新對話").first().click();
  await pageA.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  const conversationUrl = pageA.url();

  await pageA.getByLabel("訊息").fill("跨視窗同步測試訊息");
  await pageA.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(pageA);

  // AC7: B sees the new conversation within 5s, without reload.
  await expect(sidebarHistory(pageB).getByRole("link", { name: "新對話" })).toBeVisible({ timeout: 5000 });

  // B opens it via an in-app click (not page.goto) and sees both messages
  // (the user's + the completed assistant reply) — also without reload.
  await sidebarHistory(pageB).getByRole("link", { name: "新對話" }).click();
  await pageB.waitForURL(conversationUrl);
  await expect(messageItems(pageB)).toHaveCount(2, { timeout: 5000 });

  // A renames -> B's sidebar rail updates live.
  await pageA.getByRole("button", { name: "重新命名" }).click();
  await pageA.getByLabel("對話名稱").fill("同步後的標題");
  await pageA.getByRole("button", { name: "儲存" }).click();
  await expect(sidebarHistory(pageB).getByRole("link", { name: "同步後的標題" })).toBeVisible({ timeout: 5000 });

  // A deletes -> B (currently ON that conversation's detail page) shows
  // the deleted-elsewhere notice, then is redirected back to the list.
  await pageA.getByRole("button", { name: "刪除對話" }).click();
  await pageA.getByRole("button", { name: "確認刪除" }).click();

  await expect(pageB.getByText("此對話已在其他視窗刪除，即將返回對話列表…")).toBeVisible({ timeout: 5000 });
  await pageB.waitForURL((url) => url.pathname === "/conversations", { timeout: 5000 });

  await contextA.close();
  await contextB.close();
});
