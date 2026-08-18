import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S003 critical flow: selecting a reason for "沒有幫助"/NG feedback on
 * an assistant reply. Sibling of answer-ok-feedback.spec.ts (E13-S001) /
 * answer-ng-feedback.spec.ts (E13-S002) — same in-app navigation pattern
 * for the reload-persistence check (never page.goto()/page.reload(),
 * which wipes the mock AuthClient's in-memory session and bounces to
 * /login).
 *
 * All `getByRole("button", { name: "沒有幫助" })` calls below pass
 * `exact: true` for the same substring-match reason answer-ng-feedback's
 * own file doc comment explains.
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

test("E13-S003: selecting a reason for NG feedback persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();

  await reply.getByRole("radio", { name: "答案不完整" }).check();
  await reply.getByRole("button", { name: "送出原因" }).click();
  await expect(reply.getByText("已選擇原因：答案不完整")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await waitForThreadToSettle(page);
  await expect(messageItems(page).nth(1).getByText("已選擇原因：答案不完整")).toBeVisible();
});

test("E13-S003: the reason selector does not appear until NG feedback is given, and the submit button requires a selection first", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await expect(reply.getByText("為什麼沒有幫助？")).not.toBeVisible();

  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByText("為什麼沒有幫助？")).toBeVisible();
  await expect(reply.getByRole("button", { name: "送出原因" })).toBeDisabled();

  await reply.getByRole("radio", { name: "答案離題" }).check();
  await expect(reply.getByRole("button", { name: "送出原因" })).toBeEnabled();
});

test("E13-S003: giving OK feedback never shows a reason selector", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();
  await expect(reply.getByText("為什麼沒有幫助？")).not.toBeVisible();
});
