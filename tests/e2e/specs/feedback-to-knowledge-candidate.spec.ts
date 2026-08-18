import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S015 critical flow: flagging an NG-feedback answer (with reason +
 * comment already given, E13-S002/S003/S004) as a knowledge candidate.
 * Sibling of free-text-feedback.spec.ts (E13-S004) — same in-app
 * navigation pattern for the reload-persistence check (never
 * page.goto()/page.reload(), which wipes the mock AuthClient's
 * in-memory session and bounces to /login).
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

test("E13-S015: the flag button does not appear until NG feedback + reason + comment are all given", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await expect(reply.getByRole("button", { name: "標記為知識落差候選" })).not.toBeVisible();

  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "標記為知識落差候選" })).not.toBeVisible();

  await reply.getByRole("radio", { name: "答案不正確" }).check();
  await reply.getByRole("button", { name: "送出原因" }).click();
  await expect(reply.getByText("已選擇原因：答案不正確")).toBeVisible();
  // Reason alone: still no flag button, a comment is also required.
  await expect(reply.getByRole("button", { name: "標記為知識落差候選" })).not.toBeVisible();

  await reply.getByLabel("留言").fill("答案裡引用的保固期限其實是舊版，已經在三月更新過了。");
  await reply.getByRole("button", { name: "送出留言" }).click();
  await expect(reply.getByText("已送出留言：答案裡引用的保固期限其實是舊版，已經在三月更新過了。")).toBeVisible();

  await expect(reply.getByRole("button", { name: "標記為知識落差候選" })).toBeVisible();
});

test("E13-S015: flagging a candidate locks the button and persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await reply.getByRole("radio", { name: "答案不正確" }).check();
  await reply.getByRole("button", { name: "送出原因" }).click();
  await reply.getByLabel("留言").fill("答案裡引用的保固期限其實是舊版了。");
  await reply.getByRole("button", { name: "送出留言" }).click();
  await expect(reply.getByText(/已送出留言/)).toBeVisible();

  await reply.getByRole("button", { name: "標記為知識落差候選" }).click();
  await expect(reply.getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await waitForThreadToSettle(page);
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已標記為知識落差候選" })).toBeDisabled();
});

test("E13-S015: the flag button never appears for OK feedback, even with a comment", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "有幫助", exact: true }).click();
  await reply.getByLabel("留言").fill("答案特別清楚，謝謝。");
  await reply.getByRole("button", { name: "送出留言" }).click();
  await expect(reply.getByText(/已送出留言/)).toBeVisible();

  await expect(reply.getByRole("button", { name: "標記為知識落差候選" })).not.toBeVisible();
});
