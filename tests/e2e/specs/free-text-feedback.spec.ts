import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S004 critical flow: leaving a free-text comment on an assistant
 * reply after giving OK or NG feedback. Sibling of
 * feedback-reason-selector.spec.ts (E13-S003) — same in-app navigation
 * pattern for the reload-persistence check (never page.goto()/
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

test("E13-S004: leaving a comment after OK feedback persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();

  await reply.getByLabel("留言").fill("答案清楚引用了正確的保固條文，謝謝。");
  await reply.getByRole("button", { name: "送出留言" }).click();
  await expect(reply.getByText("已送出留言：答案清楚引用了正確的保固條文，謝謝。")).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await waitForThreadToSettle(page);
  await expect(messageItems(page).nth(1).getByText("已送出留言：答案清楚引用了正確的保固條文，謝謝。")).toBeVisible();
});

test("E13-S004: the comment box does not appear until feedback is given, and the submit button requires non-whitespace text first", async ({
  page,
}) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await expect(reply.getByText("還有什麼想補充的嗎？")).not.toBeVisible();

  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByText("還有什麼想補充的嗎？")).toBeVisible();
  await expect(reply.getByRole("button", { name: "送出留言" })).toBeDisabled();

  await reply.getByLabel("留言").fill("   ");
  await expect(reply.getByRole("button", { name: "送出留言" })).toBeDisabled();

  await reply.getByLabel("留言").fill("引用的條文其實已經過期了。");
  await expect(reply.getByRole("button", { name: "送出留言" })).toBeEnabled();
});

test("E13-S004: a comment box appears for both OK and NG feedback, unlike the NG-only reason selector", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：有幫助" })).toBeVisible();

  // OK feedback: no reason selector, but the comment box IS present.
  await expect(reply.getByText("為什麼沒有幫助？")).not.toBeVisible();
  await expect(reply.getByLabel("留言")).toBeVisible();
});
