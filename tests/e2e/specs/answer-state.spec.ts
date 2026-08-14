import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S021 critical flow: assistant replies render a distinct state
 * badge for the 5 non-ANSWERED SOURCE_BASELINE states (PARTIAL/
 * NO_EVIDENCE/ERROR/PERMISSION_DENIED/SOURCE_UNAVAILABLE), classified
 * via lib/answer-state.ts's honestly-labeled mock trigger phrases (see
 * that file's doc comment for why this mock exists rather than a real
 * RAG/authorization classifier). Navigation after login always uses
 * in-app link clicks, never page.goto() — see conversations.spec.ts's
 * file doc comment for why.
 *
 * Doesn't exhaustively re-test all 6 states here — message-thread.
 * test.tsx's "answer state rendering" describe block already covers
 * every state's badge/role/content behavior directly. This file covers
 * the end-to-end flow (typing a trigger phrase actually reaches the
 * rendered badge through the real app, not a mocked one) plus the two
 * behaviors most worth confirming for real: NO_EVIDENCE's content
 * replacement + persistence across reload, and PERMISSION_DENIED's
 * assertive alert role (the story's one genuinely security-relevant
 * state, per SOURCE_BASELINE §5's Authorization-before-retrieval and
 * no-permission-data-to-LLM pinned decisions).
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

test("E03-S021: a question with no trigger phrase shows a normal reply with no state badge", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await expect(page.getByText("查無依據")).toHaveCount(0);
  await expect(page.getByText("部分回答")).toHaveCount(0);
  await expect(page.getByText("發生錯誤")).toHaveCount(0);
  await expect(page.getByText("無權限查看")).toHaveCount(0);
  await expect(page.getByText("來源無法取得")).toHaveCount(0);
});

test("E03-S021: NO_EVIDENCE trigger replaces the reply with fallback content and a badge, surviving reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:NO_EVIDENCE]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  // No special role — this badge is informational, not an alert (that's
  // reserved for ERROR/PERMISSION_DENIED; see message-thread.tsx).
  await expect(page.getByRole("main").getByText("查無依據", { exact: true })).toBeVisible();
  // E03-S30 corrected this fallback sentence to match SOURCE_BASELINE.md's
  // own quoted («»-marked) display text for this state (line 1251) —
  // see lib/answer-state.ts's own doc comment for the full story.
  await expect(page.getByText("找不到足夠企業資料支持此答案", { exact: false })).toBeVisible();
  // The normal fixed mock reply text must NOT appear — content was
  // replaced outright, not appended alongside it.
  await expect(page.getByText("模擬回覆）這是前端展示用的固定文字", { exact: false })).toHaveCount(0);

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByRole("main").getByText("查無依據", { exact: true })).toBeVisible();
});

test("E03-S021: PERMISSION_DENIED trigger renders its badge as an assertive alert, not a passive status", async ({ page }) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？ [模擬:PERMISSION_DENIED]");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  // role="alert" on a plain <span> (no aria-label) doesn't get an
  // accessible NAME computed from its own text content — confirmed via
  // a throwaway diagnostic: getByRole("alert") alone found it (count 1),
  // getByRole("alert", { name: "無權限查看" }) found nothing. Checking
  // role and text separately avoids relying on name-from-content, which
  // apparently doesn't apply to the "alert" role the way it does for
  // "button"/"link"/"heading".
  const alertBadge = page.getByRole("main").getByRole("alert");
  await expect(alertBadge).toBeVisible();
  await expect(alertBadge).toHaveText("無權限查看");
});
