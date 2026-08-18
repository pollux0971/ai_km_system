import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E13-S002 critical flow: giving "NG"/not-helpful feedback on an assistant
 * reply. Sibling of answer-ok-feedback.spec.ts (E13-S001) — same in-app
 * navigation pattern for the reload-persistence check (never
 * page.goto()/page.reload(), which wipes the mock AuthClient's in-memory
 * session and bounces to /login).
 *
 * All `getByRole("button", { name: ... })` calls below pass `exact: true`
 * — Playwright's `name` string matching defaults to a case-insensitive
 * SUBSTRING search (unlike Testing Library's exact-by-default), and
 * "有幫助" is a literal substring of "沒有幫助"/"已回饋：沒有幫助". Without
 * `exact`, a locator meant for one button can silently match its sibling
 * too. See answer-ok-feedback.spec.ts's own doc comment for the same
 * issue on its side of this pair.
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

async function waitForThreadToSettle(page: import("@playwright/test").Page) {
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
}

async function openConversation(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  // Scoped to <main> — the sidebar's own "歷史對話" rail also links to
  // this same conversation by the same title, so an unscoped getByRole
  // here is ambiguous.
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E13-S002: giving 沒有幫助 feedback on an assistant reply persists across reload", async ({ page }) => {
  await openConversation(page);
  const conversationUrl = page.url();

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(2);

  await messageItems(page).nth(1).getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("main").getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL(conversationUrl);

  await waitForThreadToSettle(page);
  await expect(messageItems(page).nth(1).getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();
});

test("E13-S002: the 沒有幫助 button is offered on every settled assistant reply, not only the last one, and never on the user's own message", async ({
  page,
}) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  await page.getByLabel("訊息").fill("有哪些排除項目？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);
  await expect(messageItems(page)).toHaveCount(4);

  await expect(page.getByRole("button", { name: "沒有幫助", exact: true })).toHaveCount(2);
  await expect(messageItems(page).nth(0)).not.toContainText("沒有幫助");
  await expect(messageItems(page).nth(1)).toContainText("沒有幫助");
  await expect(messageItems(page).nth(2)).not.toContainText("沒有幫助");
  await expect(messageItems(page).nth(3)).toContainText("沒有幫助");
});

test("E13-S002: giving 沒有幫助 feedback also disables the sibling 有幫助 button on the same reply — one verdict, not two independent toggles", async ({
  page,
}) => {
  await openConversation(page);

  await page.getByLabel("訊息").fill("保固期限是多久？");
  await page.getByRole("button", { name: "送出" }).click();
  await waitForThreadToSettle(page);

  const reply = messageItems(page).nth(1);
  await reply.getByRole("button", { name: "沒有幫助", exact: true }).click();
  await expect(reply.getByRole("button", { name: "已回饋：沒有幫助" })).toBeVisible();

  // The OK button stays labeled 有幫助 (NG, not OK, was the verdict given)
  // but must no longer be clickable.
  await expect(reply.getByRole("button", { name: "有幫助", exact: true })).toBeDisabled();
});
