import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S006 "feedback submission state" critical flow. See
 * apps/web/src/lib/messages.test.ts's own "feedback submission state
 * composition" describe block for the full inventory this story is
 * based on: S001-S005 each already proved its OWN pending/loading/
 * success/validation-error UX state in isolation, so this story's scope
 * is deliberately NOT a repeat of that — it is the one thing nothing
 * before it proved: that all four feedback dimensions (verdict/reason/
 * comment/citation) genuinely compose correctly when all given on the
 * SAME reply in one real session, and that a second, untouched reply in
 * the same conversation stays completely unaffected. Same in-app
 * navigation precedent as every other E13 spec (never page.goto()/
 * page.reload(), which wipes the mock AuthClient's in-memory session and
 * bounces to /login).
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

function previewDrawer(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "引用來源預覽" });
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

test("E13-S006: giving verdict, reason, a comment, and citation feedback all on one reply persists all four together across reload, without leaking into a second, untouched reply", async ({
  page,
}) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  const firstReply = messageItems(page).nth(1);
  const secondReply = messageItems(page).nth(3);

  // Give NG verdict, then a reason, then a free-text comment, then citation
  // feedback — all four dimensions, on the same reply, in one real session.
  await firstReply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(firstReply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();

  await firstReply.getByRole("radio", { name: "答案不完整" }).check();
  await firstReply.getByRole("button", { name: "送出原因" }).click();
  await expect(firstReply.getByText("已選擇原因：答案不完整")).toBeVisible();

  await firstReply.getByLabel("留言").fill("少了逾期未申報的排除情形。");
  await firstReply.getByRole("button", { name: "送出留言" }).click();
  await expect(firstReply.getByText("已送出留言：少了逾期未申報的排除情形。")).toBeVisible();

  await firstReply.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(previewDrawer(page)).toBeVisible();
  await previewDrawer(page).getByRole("button", { name: "此引用不準確" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用不準確" })).toBeVisible();
  await previewDrawer(page).getByRole("button", { name: "關閉" }).click();
  await expect(previewDrawer(page)).not.toBeVisible();

  // The second, untouched reply carries none of the first reply's feedback.
  await expect(secondReply.getByRole("button", { name: "有幫助", exact: true })).toBeEnabled();
  await expect(secondReply.getByRole("button", { name: "沒有幫助", exact: true })).toBeEnabled();
  await expect(secondReply.getByText("為什麼沒有幫助？")).not.toBeVisible();
  await expect(secondReply.getByLabel("留言")).not.toBeVisible();

  // Navigate away and back (this codebase's reload-equivalent) — all four
  // dimensions on the first reply must still be there, together, and the
  // second reply must still be completely untouched.
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);
  await waitForThreadToSettle(page);

  const reloadedFirstReply = messageItems(page).nth(1);
  const reloadedSecondReply = messageItems(page).nth(3);

  await expect(reloadedFirstReply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();
  await expect(reloadedFirstReply.getByText("已選擇原因：答案不完整")).toBeVisible();
  await expect(reloadedFirstReply.getByText("已送出留言：少了逾期未申報的排除情形。")).toBeVisible();
  await reloadedFirstReply.getByRole("button", { name: "檢視引用來源 1" }).click();
  await expect(previewDrawer(page).getByRole("button", { name: "已回饋：此引用不準確" })).toBeVisible();
  await previewDrawer(page).getByRole("button", { name: "關閉" }).click();

  await expect(reloadedSecondReply.getByRole("button", { name: "有幫助", exact: true })).toBeEnabled();
  await expect(reloadedSecondReply.getByRole("button", { name: "沒有幫助", exact: true })).toBeEnabled();
  await expect(reloadedSecondReply.getByText("為什麼沒有幫助？")).not.toBeVisible();
  await expect(reloadedSecondReply.getByLabel("留言")).not.toBeVisible();
});
